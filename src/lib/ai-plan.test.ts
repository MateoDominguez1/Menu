import { describe, expect, it } from "vitest";
import { parseAiPlan } from "./ai-plan";
import { recipe } from "./fixtures";

const recipes = new Map([
  [1, recipe(1, "A", "dinner", [[1, 10]])],
  [2, recipe(2, "B", "lunch", [[1, 10]])],
  [3, recipe(3, "Desayuno", "breakfast", [[1, 10]])],
]);
const slots = [
  { date: "2026-10-21", slot: "lunch" as const },
  { date: "2026-10-21", slot: "dinner" as const },
];

describe("parseAiPlan", () => {
  it("acepta una respuesta valida, incluso con texto alrededor", () => {
    const text = 'Aqui va:\n{"picks":[{"date":"2026-10-21","slot":"lunch","recipeId":2},{"date":"2026-10-21","slot":"dinner","recipeId":1}]}';
    expect(parseAiPlan(text, slots, recipes, 2)?.map((p) => p.recipeId)).toEqual([2, 1]);
  });

  it("rechaza JSON roto", () => {
    expect(parseAiPlan("no es json", slots, recipes, 2)).toBeNull();
    expect(parseAiPlan('{"picks":[', slots, recipes, 2)).toBeNull();
  });

  it("rechaza ids inexistentes", () => {
    const text = '{"picks":[{"date":"2026-10-21","slot":"lunch","recipeId":99},{"date":"2026-10-21","slot":"dinner","recipeId":1}]}';
    expect(parseAiPlan(text, slots, recipes, 2)).toBeNull();
  });

  it("rechaza recetas de un tipo de comida incompatible", () => {
    const text = '{"picks":[{"date":"2026-10-21","slot":"lunch","recipeId":3},{"date":"2026-10-21","slot":"dinner","recipeId":1}]}';
    expect(parseAiPlan(text, slots, recipes, 2)).toBeNull();
  });

  it("rechaza si falta alguna comida", () => {
    const text = '{"picks":[{"date":"2026-10-21","slot":"lunch","recipeId":2}]}';
    expect(parseAiPlan(text, slots, recipes, 2)).toBeNull();
  });

  it("rechaza repeticiones por encima del maximo", () => {
    const text = '{"picks":[{"date":"2026-10-21","slot":"lunch","recipeId":1},{"date":"2026-10-21","slot":"dinner","recipeId":1}]}';
    expect(parseAiPlan(text, slots, recipes, 1)).toBeNull();
  });
});
