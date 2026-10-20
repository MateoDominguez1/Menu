import type { IngredientLite, RecipeLite } from "./types";

export type Nutrition = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** false si algun ingrediente no tiene datos nutricionales: el total esta subestimado. */
  complete: boolean;
  /** Siempre estimacion: los valores no vienen de la etiqueta del producto. */
  isEstimate: boolean;
};

export const EMPTY_NUTRITION: Nutrition = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  complete: true,
  isEstimate: true,
};

function grams(ing: IngredientLite, qty: number): number | null {
  if (ing.baseUnit === "g" || ing.baseUnit === "ml") return qty;
  return ing.gramsPerUnit ? qty * ing.gramsPerUnit : null;
}

export function recipeNutritionPerServing(
  recipe: RecipeLite,
  ingredients: Map<number, IngredientLite>,
): Nutrition {
  const total: Nutrition = { ...EMPTY_NUTRITION };
  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) {
      total.complete = false;
      continue;
    }
    const g = grams(ing, ri.quantity);
    if (
      g === null ||
      ing.kcal100 === null ||
      ing.protein100 === null ||
      ing.carbs100 === null ||
      ing.fat100 === null
    ) {
      total.complete = false;
      continue;
    }
    const f = g / 100;
    total.kcal += ing.kcal100 * f;
    total.protein += ing.protein100 * f;
    total.carbs += ing.carbs100 * f;
    total.fat += ing.fat100 * f;
  }
  const s = recipe.servings || 1;
  return {
    kcal: total.kcal / s,
    protein: total.protein / s,
    carbs: total.carbs / s,
    fat: total.fat / s,
    complete: total.complete,
    isEstimate: true,
  };
}

export function sumNutrition(parts: Nutrition[]): Nutrition {
  return parts.reduce<Nutrition>(
    (acc, p) => ({
      kcal: acc.kcal + p.kcal,
      protein: acc.protein + p.protein,
      carbs: acc.carbs + p.carbs,
      fat: acc.fat + p.fat,
      complete: acc.complete && p.complete,
      isEstimate: true,
    }),
    { ...EMPTY_NUTRITION },
  );
}
