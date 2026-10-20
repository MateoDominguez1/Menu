import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { recipeNutritionPerServing } from "@/lib/nutrition";
import {
  estimatePlanCost,
  generatePlan,
  recipeDealScore,
  suggestAlternatives,
  usableRecipes,
  type PlannerInput,
} from "@/lib/planner";
import { aiEnabled, aiPickRecipes } from "./ai";
import { buildPackInfo, buildUnitCost, loadCatalog, type CatalogData } from "./catalog";
import { currentDeals, recentHistory, refreshGeneratedRecipes } from "./generated";
import { recipeCard } from "./queries";
import { syncShoppingList } from "./sync";

export type Skip = { date: string; slot: s.Slot; reason: "work" | "out" | "other" };

export function enabledSlots(profile: s.Profile): s.Slot[] {
  const out: s.Slot[] = [];
  if (profile.planBreakfast) out.push("breakfast");
  if (profile.planLunch) out.push("lunch");
  if (profile.planDinner) out.push("dinner");
  if (profile.planSnacks) out.push("snack");
  return out;
}

function plannerInput(
  data: CatalogData,
  slots: PlannerInput["slots"],
  budgetCents: number,
  seed: number,
  locked: PlannerInput["locked"] = new Map(),
  extras: Partial<PlannerInput> = {},
): PlannerInput {
  return {
    slots,
    recipes: [...data.recipes.values()],
    ingredients: data.ingredients,
    avoid: data.avoid,
    discardedIds: data.discardedIds,
    favoriteIds: data.favoriteIds,
    pantry: data.pantry,
    unitCost: buildUnitCost(data, todayISO()),
    budgetCents,
    maxMinutes: data.profile.cookMinutesPerMeal,
    locked,
    maxRepeats: 2,
    seed,
    servings: 1,
    ...extras,
  };
}

/** Ofertas vigentes e historial reciente: lo que vuelve variable y economico al plan. */
async function plannerExtras(data: CatalogData, excludePlanId: number | null): Promise<Partial<PlannerInput>> {
  const today = todayISO();
  const [deals, history] = await Promise.all([currentDeals(today), recentHistory(excludePlanId, today)]);
  const dealScores = new Map<number, number>();
  for (const r of data.recipes.values()) {
    const sc = recipeDealScore(r, deals.byIngredient);
    if (sc > 0) dealScores.set(r.id, sc);
  }
  const proteinPerServing = new Map<number, number>();
  for (const r of data.recipes.values()) {
    proteinPerServing.set(r.id, recipeNutritionPerServing(r, data.ingredients).protein);
  }
  return {
    dealScores,
    recentRecipes: history.recipes,
    recentIngredients: history.ingredients,
    proteinPerServing,
    packInfo: buildPackInfo(data, today),
  };
}

export type GenerateOptions = {
  weekStart: string;
  days: number;
  budgetCents: number;
  skips: Skip[];
  seed: number;
};

export async function generateWeekPlan(opts: GenerateOptions) {
  const db = getDb();
  // Primero se componen recetas nuevas segun las ofertas vigentes, para que el plan no dependa solo de las fijas.
  await refreshGeneratedRecipes(opts.seed);
  const data = await loadCatalog();
  const priorPlan = (
    await db
      .select()
      .from(s.mealPlans)
      .where(and(eq(s.mealPlans.weekStart, opts.weekStart), eq(s.mealPlans.days, opts.days)))
      .limit(1)
  )[0];
  const extras = await plannerExtras(data, priorPlan?.id ?? null);
  const slotTypes = enabledSlots(data.profile);
  const dates = Array.from({ length: opts.days }, (_, i) => addDays(opts.weekStart, i));
  const skipMap = new Map(opts.skips.map((k) => [`${k.date}|${k.slot}`, k.reason]));

  const toFill = dates.flatMap((date) =>
    slotTypes.filter((slot) => !skipMap.has(`${date}|${slot}`)).map((slot) => ({ date, slot })),
  );
  const input = plannerInput(data, toFill, opts.budgetCents, opts.seed, new Map(), extras);
  const result = generatePlan(input);
  let generator: "local" | "ai" = "local";
  const warnings = [...result.warnings];

  if (aiEnabled() && toFill.length > 0) {
    const usable = usableRecipes(input);
    const usableMap = new Map(usable.map((r) => [r.id, r]));
    const today = todayISO();
    const picks = await aiPickRecipes(
      {
        slots: toFill,
        recipes: usable.map((r) => {
          const card = recipeCard(data, r.id, today)!;
          return {
            id: r.id,
            name: r.name,
            mealType: r.mealType,
            minutes: r.minutes,
            costCents: card.costCents,
            kcal: Math.round(card.nutrition.kcal),
            protein: Math.round(card.nutrition.protein),
            ingredients: r.ingredients.map((i) => data.ingredients.get(i.ingredientId)?.name ?? ""),
          };
        }),
        budgetCents: opts.budgetCents,
        goal: data.profile.goal,
        avoid: data.avoid,
        pantry: data.pantry
          .filter((p) => p.ingredientId !== null && p.quantity > 0)
          .map((p) => data.ingredients.get(p.ingredientId as number)?.name ?? ""),
        maxMinutes: data.profile.cookMinutesPerMeal,
        maxRepeats: input.maxRepeats,
      },
      usableMap,
    );
    if (picks) {
      const cost = estimatePlanCost(
        picks.map((p) => ({ recipeId: p.recipeId, servings: input.servings, status: "planned" as const })),
        data.recipes,
        data.ingredients,
        data.pantry,
        input.unitCost,
      );
      if (cost.cents <= opts.budgetCents) {
        result.entries = picks.map((p) => ({ date: p.date, slot: p.slot, recipeId: p.recipeId, servings: input.servings }));
        result.estimatedCostCents = cost.cents;
        result.overBudget = false;
        generator = "ai";
      } else {
        warnings.push("La IA propuso un plan fuera de presupuesto: se uso el motor local");
      }
    } else {
      warnings.push("La IA no devolvio un plan valido: se uso el motor local");
    }
  }
  const chosen = new Map(result.entries.map((e) => [`${e.date}|${e.slot}`, e]));

  const found = await db
    .select()
    .from(s.mealPlans)
    .where(and(eq(s.mealPlans.weekStart, opts.weekStart), eq(s.mealPlans.days, opts.days)))
    .limit(1);

  let planId: number;
  if (found[0]) {
    planId = found[0].id;
    await db
      .update(s.mealPlans)
      .set({ budgetCents: opts.budgetCents, generator })
      .where(eq(s.mealPlans.id, planId));
    await db.delete(s.mealPlanEntries).where(eq(s.mealPlanEntries.planId, planId));
  } else {
    const [row] = await db
      .insert(s.mealPlans)
      .values({ weekStart: opts.weekStart, days: opts.days, budgetCents: opts.budgetCents, generator })
      .returning();
    planId = row.id;
  }

  const rows: (typeof s.mealPlanEntries.$inferInsert)[] = [];
  for (const date of dates) {
    for (const slot of slotTypes) {
      const reason = skipMap.get(`${date}|${slot}`);
      const pick = chosen.get(`${date}|${slot}`);
      rows.push({
        planId,
        date,
        slot,
        recipeId: reason ? null : (pick?.recipeId ?? null),
        servings: 1,
        status: reason ? "skipped" : "planned",
        skipReason: reason ?? null,
      });
    }
  }
  if (rows.length > 0) await db.insert(s.mealPlanEntries).values(rows);
  const listId = await syncShoppingList(planId);

  return {
    planId,
    listId,
    estimatedCostCents: result.estimatedCostCents,
    overBudget: result.overBudget,
    warnings,
    generator,
  };
}

/** Alternativas para una sola comida; el resto del plan no se toca. */
export async function alternativesFor(entryId: number) {
  const db = getDb();
  const [entry] = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.id, entryId));
  if (!entry) return [];
  const [plan] = await db.select().from(s.mealPlans).where(eq(s.mealPlans.id, entry.planId));
  const all = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.planId, entry.planId));
  const data = await loadCatalog();
  const others = all
    .filter((e) => e.id !== entryId && e.status === "planned")
    .map((e) => ({ date: e.date, slot: e.slot, recipeId: e.recipeId, servings: e.servings }));
  const input = plannerInput(
    data,
    [{ date: entry.date, slot: entry.slot }],
    plan.budgetCents,
    Date.now() % 100000,
    new Map(),
    await plannerExtras(data, entry.planId),
  );
  return suggestAlternatives(input, { date: entry.date, slot: entry.slot }, entry.recipeId, others, 6).map(
    (r) => ({ id: r.id, name: r.name, minutes: r.minutes }),
  );
}
