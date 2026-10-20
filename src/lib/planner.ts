import type { Slot } from "@/db/schema";
import { buildNeeds, type PlanEntryLite } from "./shopping";
import type { IngredientLite, PantryLite, RecipeLite } from "./types";

export type SlotToFill = { date: string; slot: Slot };

export type PlannerInput = {
  slots: SlotToFill[];
  recipes: RecipeLite[];
  ingredients: Map<number, IngredientLite>;
  /** Fragmentos en minusculas de ingredientes a evitar (alergias, rechazos). */
  avoid: string[];
  discardedIds: Set<number>;
  favoriteIds: Set<number>;
  pantry: PantryLite[];
  /** Centimos por unidad base (g, ml o unidad) del precio conocido mas barato. */
  unitCost: Map<number, number>;
  budgetCents: number;
  maxMinutes: number;
  /** `${date}|${slot}` -> recetaId que no se debe cambiar. */
  locked: Map<string, number>;
  maxRepeats: number;
  seed: number;
  servings: number;
};

export type PlannedSlot = SlotToFill & { recipeId: number | null; servings: number };

export type PlanResult = {
  entries: PlannedSlot[];
  estimatedCostCents: number;
  unknownCostIngredients: string[];
  overBudget: boolean;
  warnings: string[];
};

export const slotKey = (date: string, slot: Slot) => `${date}|${slot}`;

function eligibleFor(recipe: RecipeLite, slot: Slot): boolean {
  if (recipe.mealType === slot) return true;
  const main = (s: Slot) => s === "lunch" || s === "dinner";
  return main(recipe.mealType) && main(slot);
}

function containsAvoided(
  recipe: RecipeLite,
  ingredients: Map<number, IngredientLite>,
  avoid: string[],
): boolean {
  if (avoid.length === 0) return false;
  const hay = [recipe.name, ...recipe.ingredients.map((i) => ingredients.get(i.ingredientId)?.name ?? "")]
    .join(" | ")
    .toLowerCase();
  return avoid.some((a) => a && hay.includes(a));
}

function jitter(seed: number, recipeId: number, idx: number): number {
  let h = (seed * 2654435761 + recipeId * 40503 + idx * 9973) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h % 1000) / 1000) * 10 - 5;
}

export function recipeCostPerServing(
  recipe: RecipeLite,
  unitCost: Map<number, number>,
): { cents: number; unknown: number } {
  let cents = 0;
  let unknown = 0;
  for (const ri of recipe.ingredients) {
    const c = unitCost.get(ri.ingredientId);
    if (c === undefined) unknown += 1;
    else cents += c * ri.quantity;
  }
  const s = recipe.servings || 1;
  return { cents: cents / s, unknown };
}

export function estimatePlanCost(
  entries: PlanEntryLite[],
  recipes: Map<number, RecipeLite>,
  ingredients: Map<number, IngredientLite>,
  pantry: PantryLite[],
  unitCost: Map<number, number>,
): { cents: number; unknown: string[] } {
  const needs = buildNeeds(entries, recipes, ingredients, pantry);
  let cents = 0;
  const unknown: string[] = [];
  for (const n of needs) {
    const c = unitCost.get(n.ingredientId);
    if (c === undefined) {
      if (n.toBuyQty > 0) unknown.push(n.name);
    } else cents += c * n.toBuyQty;
  }
  return { cents: Math.round(cents), unknown };
}

function pickRecipe(
  input: PlannerInput,
  slot: SlotToFill,
  idx: number,
  chosen: PlannedSlot[],
  candidates: RecipeLite[],
  exclude?: Set<number>,
): RecipeLite | null {
  const usage = new Map<number, number>();
  const usedIngredients = new Set<number>();
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]));
  for (const c of chosen) {
    if (c.recipeId === null) continue;
    usage.set(c.recipeId, (usage.get(c.recipeId) ?? 0) + 1);
    recipeById.get(c.recipeId)?.ingredients.forEach((i) => usedIngredients.add(i.ingredientId));
  }
  const pantryIds = new Set(
    input.pantry.filter((p) => p.ingredientId !== null && p.quantity > 0).map((p) => p.ingredientId as number),
  );
  const prev = chosen[chosen.length - 1];

  let best: { r: RecipeLite; score: number } | null = null;
  for (const r of candidates) {
    if (exclude?.has(r.id)) continue;
    const times = usage.get(r.id) ?? 0;
    if (times >= input.maxRepeats) continue;
    const cost = recipeCostPerServing(r, input.unitCost);
    let score = 100;
    score -= (cost.cents / 100) * 8;
    score -= cost.unknown * 2;
    score -= times * 40;
    if (prev && prev.recipeId === r.id) score -= 30;
    if (input.favoriteIds.has(r.id)) score += 15;
    for (const ri of r.ingredients) {
      if (usedIngredients.has(ri.ingredientId)) score += 5;
      if (pantryIds.has(ri.ingredientId)) score += 6;
    }
    score += jitter(input.seed, r.id, idx);
    if (!best || score > best.score || (score === best.score && r.id < best.r.id)) {
      best = { r, score };
    }
  }
  return best ? best.r : null;
}

/** Recetas permitidas: no descartadas, dentro del tiempo y sin ingredientes a evitar. */
export function usableRecipes(input: PlannerInput): RecipeLite[] {
  return input.recipes.filter(
    (r) =>
      !input.discardedIds.has(r.id) &&
      r.minutes <= input.maxMinutes &&
      !containsAvoided(r, input.ingredients, input.avoid),
  );
}

export function generatePlan(input: PlannerInput): PlanResult {
  const warnings: string[] = [];
  const recipesById = new Map(input.recipes.map((r) => [r.id, r]));
  const usable = usableRecipes(input);

  const chosen: PlannedSlot[] = [];
  input.slots.forEach((slot, idx) => {
    const lockedId = input.locked.get(slotKey(slot.date, slot.slot));
    if (lockedId !== undefined) {
      chosen.push({ ...slot, recipeId: lockedId, servings: input.servings });
      return;
    }
    const candidates = usable.filter((r) => eligibleFor(r, slot.slot));
    const pick = pickRecipe(input, slot, idx, chosen, candidates);
    if (!pick) warnings.push(`Sin receta disponible para ${slot.date} (${slot.slot})`);
    chosen.push({ ...slot, recipeId: pick?.id ?? null, servings: input.servings });
  });

  const asEntries = (): PlanEntryLite[] =>
    chosen.map((c) => ({ recipeId: c.recipeId, servings: c.servings, status: "planned" as const }));
  const cost = () =>
    estimatePlanCost(asEntries(), recipesById, input.ingredients, input.pantry, input.unitCost);

  let current = cost();
  let guard = 0;
  while (current.cents > input.budgetCents && guard < 60) {
    guard += 1;
    let bestSwap: { i: number; recipeId: number; cents: number } | null = null;
    chosen.forEach((c, i) => {
      if (input.locked.has(slotKey(c.date, c.slot))) return;
      const candidates = usable.filter((r) => eligibleFor(r, c.slot) && r.id !== c.recipeId);
      for (const r of candidates) {
        const used = chosen.filter((o, j) => j !== i && o.recipeId === r.id).length;
        if (used >= input.maxRepeats) continue;
        const before = c.recipeId;
        c.recipeId = r.id;
        const trial = cost().cents;
        c.recipeId = before;
        if (trial < current.cents && (!bestSwap || trial < bestSwap.cents)) {
          bestSwap = { i, recipeId: r.id, cents: trial };
        }
      }
    });
    if (!bestSwap) break;
    chosen[(bestSwap as { i: number }).i].recipeId = (bestSwap as { recipeId: number }).recipeId;
    current = cost();
  }

  const overBudget = current.cents > input.budgetCents;
  if (overBudget) {
    warnings.push("No se encontro una combinacion dentro del presupuesto con las recetas disponibles");
  }
  if (current.unknown.length > 0) {
    warnings.push(
      `Costo parcial: faltan precios de ${current.unknown.length} ingrediente(s)`,
    );
  }

  return {
    entries: chosen,
    estimatedCostCents: current.cents,
    unknownCostIngredients: current.unknown,
    overBudget,
    warnings,
  };
}

/** Alternativas para reemplazar UNA comida sin tocar el resto del plan. */
export function suggestAlternatives(
  input: PlannerInput,
  target: SlotToFill,
  currentRecipeId: number | null,
  otherEntries: PlannedSlot[],
  limit = 5,
): RecipeLite[] {
  const usable = input.recipes.filter(
    (r) =>
      !input.discardedIds.has(r.id) &&
      r.id !== currentRecipeId &&
      r.minutes <= input.maxMinutes &&
      eligibleFor(r, target.slot) &&
      !containsAvoided(r, input.ingredients, input.avoid),
  );
  const out: RecipeLite[] = [];
  const excluded = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const pick = pickRecipe(input, target, i, otherEntries, usable, excluded);
    if (!pick) break;
    out.push(pick);
    excluded.add(pick.id);
  }
  return out;
}
