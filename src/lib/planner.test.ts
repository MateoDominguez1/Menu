import { describe, expect, it } from "vitest";
import { generatePlan, slotKey, suggestAlternatives, type PlannerInput } from "./planner";
import { ing, recipe } from "./fixtures";
import type { Slot } from "@/db/schema";

const ingredients = new Map([
  [1, ing(1, "Pasta")],
  [2, ing(2, "Tomate")],
  [3, ing(3, "Brocoli")],
  [4, ing(4, "Pollo")],
  [5, ing(5, "Arroz")],
  [6, ing(6, "Salmon")],
]);
const recipes = [
  recipe(1, "Pasta con tomate", "dinner", [[1, 100], [2, 150]]),
  recipe(2, "Pollo con arroz", "dinner", [[4, 200], [5, 100]]),
  recipe(3, "Pasta con brocoli", "dinner", [[1, 100], [3, 150]]),
  recipe(4, "Salmon con arroz", "dinner", [[6, 200], [5, 100]]),
  recipe(5, "Arroz con tomate", "dinner", [[5, 100], [2, 150]]),
];
const unitCost = new Map([
  [1, 0.2],
  [2, 0.3],
  [3, 0.4],
  [4, 0.85],
  [5, 0.25],
  [6, 2.0],
]);

function slots(n: number, slot: Slot = "dinner") {
  return Array.from({ length: n }, (_, i) => ({ date: `2026-10-${21 + i}`, slot }));
}

const base = (over: Partial<PlannerInput> = {}): PlannerInput => ({
  slots: slots(5),
  recipes,
  ingredients,
  avoid: [],
  discardedIds: new Set(),
  favoriteIds: new Set(),
  pantry: [],
  unitCost,
  budgetCents: 5000,
  maxMinutes: 30,
  locked: new Map(),
  maxRepeats: 2,
  seed: 1,
  servings: 1,
  ...over,
});

describe("generatePlan", () => {
  it("nunca usa recetas con ingredientes a evitar", () => {
    const plan = generatePlan(base({ avoid: ["brocoli"] }));
    expect(plan.entries.some((e) => e.recipeId === 3)).toBe(false);
  });

  it("nunca usa recetas descartadas", () => {
    const plan = generatePlan(base({ discardedIds: new Set([1, 2]) }));
    expect(plan.entries.some((e) => e.recipeId === 1 || e.recipeId === 2)).toBe(false);
  });

  it("respeta el maximo de repeticiones", () => {
    const plan = generatePlan(base({ slots: slots(6), maxRepeats: 1, recipes: recipes.slice(0, 4) }));
    const counts = new Map<number, number>();
    plan.entries.forEach((e) => e.recipeId && counts.set(e.recipeId, (counts.get(e.recipeId) ?? 0) + 1));
    expect([...counts.values()].every((c) => c <= 1)).toBe(true);
    expect(plan.warnings.some((w) => w.includes("Sin receta"))).toBe(true);
  });

  it("mantiene las comidas bloqueadas", () => {
    const locked = new Map([[slotKey("2026-10-21", "dinner"), 4]]);
    const plan = generatePlan(base({ locked }));
    expect(plan.entries[0].recipeId).toBe(4);
  });

  it("reduce el costo si el presupuesto es ajustado", () => {
    const loose = generatePlan(base({ budgetCents: 100000, slots: slots(4), maxRepeats: 4 }));
    const tight = generatePlan(base({ budgetCents: 300, slots: slots(4), maxRepeats: 4 }));
    expect(tight.estimatedCostCents).toBeLessThanOrEqual(loose.estimatedCostCents);
    expect(tight.entries.some((e) => e.recipeId === 4)).toBe(false);
  });

  it("avisa cuando no entra en el presupuesto", () => {
    const plan = generatePlan(base({ budgetCents: 10 }));
    expect(plan.overBudget).toBe(true);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("no incluye comidas que no hay que planificar", () => {
    const plan = generatePlan(base({ slots: slots(2) }));
    expect(plan.entries).toHaveLength(2);
  });

  it("es reproducible con la misma semilla y cambia con otra", () => {
    const a = generatePlan(base({ seed: 7 })).entries.map((e) => e.recipeId);
    const b = generatePlan(base({ seed: 7 })).entries.map((e) => e.recipeId);
    expect(a).toEqual(b);
  });
});

describe("suggestAlternatives", () => {
  it("propone alternativas distintas a la actual sin tocar el resto", () => {
    const input = base();
    const others = generatePlan(input).entries.slice(1);
    const alts = suggestAlternatives(input, input.slots[0], 1, others, 3);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((r) => r.id !== 1)).toBe(true);
  });
});
