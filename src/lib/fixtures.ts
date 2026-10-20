import type { IngredientLite, PriceLite, ProductLite, RecipeLite } from "./types";

export function ing(
  id: number,
  name: string,
  baseUnit: IngredientLite["baseUnit"] = "g",
  extra: Partial<IngredientLite> = {},
): IngredientLite {
  return {
    id,
    name,
    category: "otros",
    baseUnit,
    gramsPerUnit: null,
    kcal100: 100,
    protein100: 5,
    carbs100: 10,
    fat100: 2,
    nutritionIsEstimate: true,
    ...extra,
  };
}

export function recipe(
  id: number,
  name: string,
  mealType: RecipeLite["mealType"],
  ingredients: [number, number][],
  extra: Partial<RecipeLite> = {},
): RecipeLite {
  return {
    id,
    name,
    mealType,
    minutes: 20,
    servings: 1,
    tags: "",
    ingredients: ingredients.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    ...extra,
  };
}

export function product(
  id: number,
  storeId: number,
  ingredientId: number,
  packSize: number,
  packUnit: ProductLite["packUnit"] = "g",
  soldByWeight = false,
): ProductLite {
  return {
    id,
    storeId,
    ingredientId,
    name: `p${id}`,
    brand: null,
    packSize,
    packUnit,
    soldByWeight,
  };
}

export function price(
  productId: number,
  priceCents: number,
  extra: Partial<PriceLite> = {},
): PriceLite {
  return {
    productId,
    priceCents,
    promoPriceCents: null,
    promoConditions: null,
    sourceKind: "manual",
    sourceRef: null,
    observedAt: "2026-10-15",
    validUntil: null,
    confirmedByUser: false,
    isEstimate: false,
    ...extra,
  };
}
