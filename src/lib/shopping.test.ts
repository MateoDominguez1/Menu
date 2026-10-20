import { describe, expect, it } from "vitest";
import { buildNeeds, diffShoppingList, type ExistingItem } from "./shopping";
import { ing, recipe } from "./fixtures";

const ingredients = new Map([
  [1, ing(1, "Pasta")],
  [2, ing(2, "Tomate")],
  [3, ing(3, "Huevos", "unit")],
]);
const recipes = new Map([
  [10, recipe(10, "Pasta con tomate", "dinner", [[1, 100], [2, 200]])],
  [11, recipe(11, "Tortilla", "dinner", [[3, 3]], { servings: 1 })],
]);

describe("buildNeeds", () => {
  it("suma ingredientes repetidos entre recetas sin duplicarlos", () => {
    const needs = buildNeeds(
      [
        { recipeId: 10, servings: 1, status: "planned" },
        { recipeId: 10, servings: 1, status: "planned" },
      ],
      recipes,
      ingredients,
      [],
    );
    expect(needs.find((n) => n.ingredientId === 1)?.neededQty).toBe(200);
    expect(needs.filter((n) => n.ingredientId === 1)).toHaveLength(1);
  });

  it("escala segun las porciones del plan y de la receta", () => {
    const needs = buildNeeds(
      [{ recipeId: 10, servings: 2, status: "planned" }],
      recipes,
      ingredients,
      [],
    );
    expect(needs.find((n) => n.ingredientId === 2)?.neededQty).toBe(400);
  });

  it("descuenta la despensa y no deja negativos", () => {
    const needs = buildNeeds(
      [{ recipeId: 10, servings: 1, status: "planned" }],
      recipes,
      ingredients,
      [
        { ingredientId: 1, quantity: 500, unit: "g" },
        { ingredientId: 2, quantity: 50, unit: "g" },
      ],
    );
    const pasta = needs.find((n) => n.ingredientId === 1)!;
    const tomate = needs.find((n) => n.ingredientId === 2)!;
    expect(pasta.toBuyQty).toBe(0);
    expect(pasta.pantryQty).toBe(100);
    expect(tomate.toBuyQty).toBe(150);
  });

  it("ignora comidas omitidas y sin receta", () => {
    const needs = buildNeeds(
      [
        { recipeId: 10, servings: 1, status: "skipped" },
        { recipeId: null, servings: 1, status: "planned" },
      ],
      recipes,
      ingredients,
      [],
    );
    expect(needs).toHaveLength(0);
  });

  it("ignora despensa con unidad distinta a la del ingrediente", () => {
    const needs = buildNeeds(
      [{ recipeId: 10, servings: 1, status: "planned" }],
      recipes,
      ingredients,
      [{ ingredientId: 1, quantity: 500, unit: "ml" }],
    );
    expect(needs.find((n) => n.ingredientId === 1)?.toBuyQty).toBe(100);
  });
});

describe("diffShoppingList", () => {
  const base = (over: Partial<ExistingItem>): ExistingItem => ({
    id: 1,
    ingredientId: 1,
    isManual: false,
    checked: false,
    qtyOverridden: false,
    removedAt: null,
    neededQty: 100,
    ...over,
  });
  const needFor = (id: number) =>
    buildNeeds([{ recipeId: 10, servings: 1, status: "planned" }], recipes, ingredients, []).find(
      (n) => n.ingredientId === id,
    )!;

  it("actualiza el item existente en lugar de duplicarlo", () => {
    const diff = diffShoppingList([base({})], [needFor(1)]);
    expect(diff.insert).toHaveLength(0);
    expect(diff.update.map((u) => u.id)).toEqual([1]);
  });

  it("inserta ingredientes nuevos al cambiar una receta", () => {
    const diff = diffShoppingList([base({})], [needFor(1), needFor(2)]);
    expect(diff.insert.map((n) => n.ingredientId)).toEqual([2]);
  });

  it("quita lo que ya no se necesita, pero conserva lo ya comprado y lo manual", () => {
    const diff = diffShoppingList(
      [
        base({ id: 1, ingredientId: 1 }),
        base({ id: 2, ingredientId: 2, checked: true }),
        base({ id: 3, ingredientId: null, isManual: true }),
      ],
      [],
    );
    expect(diff.remove).toEqual([1]);
    expect(diff.zeroOut).toEqual([2]);
  });

  it("respeta los items que el usuario elimino a mano", () => {
    const diff = diffShoppingList([base({ removedAt: "2026-10-20" })], [needFor(1)]);
    expect(diff.insert).toHaveLength(0);
    expect(diff.update).toHaveLength(0);
  });
});
