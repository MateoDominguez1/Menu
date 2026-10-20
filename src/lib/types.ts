import type { BaseUnit, Category, Slot } from "@/db/schema";

export type IngredientLite = {
  id: number;
  name: string;
  category: Category;
  baseUnit: BaseUnit;
  gramsPerUnit: number | null;
  kcal100: number | null;
  protein100: number | null;
  carbs100: number | null;
  fat100: number | null;
  nutritionIsEstimate: boolean;
};

export type RecipeLite = {
  id: number;
  name: string;
  mealType: Slot;
  minutes: number;
  servings: number;
  tags: string;
  ingredients: { ingredientId: number; quantity: number }[];
};

export type ProductLite = {
  id: number;
  storeId: number;
  ingredientId: number;
  name: string;
  brand: string | null;
  packSize: number;
  packUnit: BaseUnit;
  /** Venta a granel: se paga lo que se pesa, sin redondear a envases. */
  soldByWeight: boolean;
};

export type PriceLite = {
  productId: number;
  priceCents: number;
  promoPriceCents: number | null;
  promoConditions: string | null;
  sourceKind: string;
  sourceRef: string | null;
  observedAt: string;
  validUntil: string | null;
  confirmedByUser: boolean;
  isEstimate: boolean;
};

export type PantryLite = {
  ingredientId: number | null;
  quantity: number;
  unit: BaseUnit;
};
