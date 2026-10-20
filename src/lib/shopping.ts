import type { BaseUnit } from "@/db/schema";
import type { IngredientLite, PantryLite, RecipeLite } from "./types";

export type PlanEntryLite = {
  recipeId: number | null;
  servings: number;
  status: "planned" | "skipped" | "eaten";
};

export type Need = {
  ingredientId: number;
  name: string;
  category: IngredientLite["category"];
  unit: BaseUnit;
  neededQty: number;
  pantryQty: number;
  toBuyQty: number;
};

/** Suma lo que piden las recetas planificadas, por ingrediente, y descuenta la despensa. */
export function buildNeeds(
  entries: PlanEntryLite[],
  recipes: Map<number, RecipeLite>,
  ingredients: Map<number, IngredientLite>,
  pantry: PantryLite[],
): Need[] {
  const needed = new Map<number, number>();
  for (const e of entries) {
    if (e.status !== "planned" || e.recipeId === null) continue;
    const recipe = recipes.get(e.recipeId);
    if (!recipe) continue;
    const factor = e.servings / (recipe.servings || 1);
    for (const ri of recipe.ingredients) {
      needed.set(ri.ingredientId, (needed.get(ri.ingredientId) ?? 0) + ri.quantity * factor);
    }
  }

  const stock = new Map<number, number>();
  for (const p of pantry) {
    if (p.ingredientId === null) continue;
    const ing = ingredients.get(p.ingredientId);
    if (!ing || ing.baseUnit !== p.unit) continue;
    stock.set(p.ingredientId, (stock.get(p.ingredientId) ?? 0) + p.quantity);
  }

  const out: Need[] = [];
  for (const [ingredientId, neededQty] of needed) {
    const ing = ingredients.get(ingredientId);
    if (!ing) continue;
    const pantryQty = Math.min(stock.get(ingredientId) ?? 0, neededQty);
    out.push({
      ingredientId,
      name: ing.name,
      category: ing.category,
      unit: ing.baseUnit,
      neededQty: round(neededQty),
      pantryQty: round(pantryQty),
      toBuyQty: round(Math.max(0, neededQty - pantryQty)),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ExistingItem = {
  id: number;
  ingredientId: number | null;
  isManual: boolean;
  checked: boolean;
  qtyOverridden: boolean;
  removedAt: string | null;
  neededQty: number;
};

export type ListDiff = {
  insert: Need[];
  update: { id: number; need: Need }[];
  /** Items que dejaron de ser necesarios y no estan comprados ni son manuales. */
  remove: number[];
  /** Items que dejaron de ser necesarios pero ya estaban marcados: se conservan con necesidad 0. */
  zeroOut: number[];
};

/**
 * Reconcilia la lista existente con las necesidades nuevas sin duplicar ingredientes
 * y sin pisar cambios hechos a mano (items manuales, cantidades editadas, eliminados, comprados).
 */
export function diffShoppingList(existing: ExistingItem[], needs: Need[]): ListDiff {
  const byIngredient = new Map<number, ExistingItem>();
  for (const e of existing) {
    if (e.ingredientId !== null && !e.isManual) byIngredient.set(e.ingredientId, e);
  }
  const diff: ListDiff = { insert: [], update: [], remove: [], zeroOut: [] };
  const seen = new Set<number>();

  for (const need of needs) {
    const current = byIngredient.get(need.ingredientId);
    if (!current) {
      diff.insert.push(need);
      continue;
    }
    seen.add(need.ingredientId);
    if (current.removedAt) continue;
    diff.update.push({ id: current.id, need });
  }

  for (const [ingredientId, item] of byIngredient) {
    if (seen.has(ingredientId) || item.removedAt) continue;
    if (item.checked) diff.zeroOut.push(item.id);
    else diff.remove.push(item.id);
  }
  return diff;
}
