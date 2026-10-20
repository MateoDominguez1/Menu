import { and, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { addDays, todayISO } from "@/lib/dates";
import { composeRecipes } from "@/lib/composer";
import { buildPackInfo, loadCatalog } from "./catalog";

/** Un envase mas caro que esto (en centimos) no se usa para componer comidas. */
const MAX_PACK_CENTS = 900;

export type DealInfo = {
  /** ingredientId -> mayor descuento (0-100) entre las ofertas vigentes. */
  byIngredient: Map<number, number>;
  /** Nombre de ingrediente -> descuento, para el compositor. */
  byName: Map<string, number>;
};

export async function currentDeals(today: string): Promise<DealInfo> {
  const db = getDb();
  const [rows, ings] = await Promise.all([
    db.select().from(s.offers).where(gte(s.offers.validUntil, today)),
    db.select().from(s.ingredients),
  ]);
  const nameOf = new Map(ings.map((i) => [i.id, i.name]));
  const byIngredient = new Map<number, number>();
  for (const o of rows) {
    if (o.ingredientId === null) continue;
    const d = o.discountPct ?? (o.regularCents && o.regularCents > o.priceCents ? Math.round(((o.regularCents - o.priceCents) / o.regularCents) * 100) : 0);
    byIngredient.set(o.ingredientId, Math.max(byIngredient.get(o.ingredientId) ?? 0, d));
  }
  const byName = new Map<string, number>();
  for (const [id, d] of byIngredient) {
    const n = nameOf.get(id);
    if (n) byName.set(n, d);
  }
  return { byIngredient, byName };
}

/**
 * Recompone las recetas automaticas segun las ofertas vigentes: borra las generadas que ningun plan uso
 * y crea unas nuevas. Las que ya estan en un plan (historial) se conservan.
 */
export async function refreshGeneratedRecipes(seed: number): Promise<{ created: number }> {
  const db = getDb();
  const today = todayISO();
  const data = await loadCatalog();
  const deals = await currentDeals(today);

  const used = new Set(
    (await db.select({ id: s.mealPlanEntries.recipeId }).from(s.mealPlanEntries))
      .map((r) => r.id)
      .filter((x): x is number => x !== null),
  );
  const generated = await db.select({ id: s.recipes.id }).from(s.recipes).where(eq(s.recipes.source, "generated"));
  const favorites = new Set(
    (await db.select().from(s.recipePrefs)).filter((p) => p.status === "favorite").map((p) => p.recipeId),
  );
  const stale = generated.map((g) => g.id).filter((id) => !used.has(id) && !favorites.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    await db.delete(s.recipes).where(inArray(s.recipes.id, stale.slice(i, i + 200)));
  }

  const existing = await db.select({ name: s.recipes.name }).from(s.recipes);
  const ingByName = new Map([...data.ingredients.values()].map((i) => [i.name, i]));
  // Solo se compone con lo que se puede comprar y costear: ingredientes de la despensa fija, o con precio vigente
  // y un envase razonable para una persona (un envase de mariscos de 17 EUR no entra en un presupuesto semanal).
  const packs = buildPackInfo(data, today);
  const available = new Set(
    [...ingByName.values()]
      .filter((i) => {
        if (data.staples.has(i.id)) return true;
        const p = packs.get(i.id);
        return p !== undefined && (p.soldByWeight || p.cents <= MAX_PACK_CENTS);
      })
      .map((i) => i.name),
  );
  const composed = composeRecipes({
    available,
    deals: deals.byName,
    avoid: data.avoid,
    existingNames: new Set(existing.map((r) => r.name.toLowerCase())),
    seed,
    total: 70,
  });

  let created = 0;
  for (const r of composed) {
    const items = r.items.flatMap((it) => {
      const ing = ingByName.get(it.ingredient);
      return ing ? [{ ingredientId: ing.id, quantity: it.quantity }] : [];
    });
    if (items.length === 0) continue;
    const [row] = await db
      .insert(s.recipes)
      .values({
        name: r.name,
        mealType: r.mealType,
        minutes: r.minutes,
        servings: 1,
        instructions: r.instructions,
        tags: r.tags,
        source: "generated",
      })
      .returning();
    await db.insert(s.recipeIngredients).values(items.map((it) => ({ recipeId: row.id, ...it })));
    created += 1;
  }
  return { created };
}

/** Que comiste en los ultimos dias: recetas (dias desde que se comieron) e ingredientes (veces). */
export async function recentHistory(
  excludePlanId: number | null,
  today: string,
  days = 28,
): Promise<{ recipes: Map<number, number>; ingredients: Map<number, number> }> {
  const db = getDb();
  const since = addDays(today, -days);
  const rows = await db
    .select()
    .from(s.mealPlanEntries)
    .where(and(gte(s.mealPlanEntries.date, since), notInArray(s.mealPlanEntries.status, ["skipped"])));
  const recipes = new Map<number, number>();
  const ingredients = new Map<number, number>();
  const ri = await db.select().from(s.recipeIngredients);
  const byRecipe = new Map<number, number[]>();
  for (const x of ri) byRecipe.set(x.recipeId, [...(byRecipe.get(x.recipeId) ?? []), x.ingredientId]);
  for (const e of rows) {
    if (e.recipeId === null || (excludePlanId !== null && e.planId === excludePlanId)) continue;
    const ago = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${e.date}T00:00:00Z`)) / 86_400_000));
    recipes.set(e.recipeId, Math.min(recipes.get(e.recipeId) ?? Infinity, ago));
    for (const iid of byRecipe.get(e.recipeId) ?? []) ingredients.set(iid, (ingredients.get(iid) ?? 0) + 1);
  }
  return { recipes, ingredients };
}
