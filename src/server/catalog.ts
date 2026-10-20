import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { pickBestPrice, type Catalog } from "@/lib/pricing";
import type {
  IngredientLite,
  PantryLite,
  PriceLite,
  ProductLite,
  RecipeLite,
} from "@/lib/types";

export type CatalogData = {
  ingredients: Map<number, IngredientLite>;
  recipes: Map<number, RecipeLite>;
  stores: s.Store[];
  products: Map<number, ProductLite>;
  catalog: Catalog;
  pantry: PantryLite[];
  staples: Set<number>;
  avoid: string[];
  favoriteIds: Set<number>;
  discardedIds: Set<number>;
  profile: s.Profile;
};

export async function loadCatalog(): Promise<CatalogData> {
  const db = getDb();
  const [ingRows, recipeRows, riRows, storeRows, productRows, priceRows, pantryRows, ruleRows, prefRows, profileRows] =
    await Promise.all([
      db.select().from(s.ingredients),
      db.select().from(s.recipes),
      db.select().from(s.recipeIngredients),
      db.select().from(s.stores),
      db.select().from(s.products),
      db.select().from(s.priceRecords),
      db.select().from(s.pantryItems),
      db.select().from(s.profileRules),
      db.select().from(s.recipePrefs),
      db.select().from(s.profile).where(eq(s.profile.id, 1)),
    ]);

  const profile = profileRows[0];
  if (!profile) throw new Error("Falta el perfil. Ejecuta: npm run db:seed");

  const ingredients = new Map<number, IngredientLite>(
    ingRows.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        category: i.category,
        baseUnit: i.baseUnit,
        gramsPerUnit: i.gramsPerUnit,
        kcal100: i.kcal100,
        protein100: i.protein100,
        carbs100: i.carbs100,
        fat100: i.fat100,
        nutritionIsEstimate: i.nutritionIsEstimate,
      },
    ]),
  );

  const byRecipe = new Map<number, { ingredientId: number; quantity: number }[]>();
  for (const ri of riRows) {
    const list = byRecipe.get(ri.recipeId) ?? [];
    list.push({ ingredientId: ri.ingredientId, quantity: ri.quantity });
    byRecipe.set(ri.recipeId, list);
  }
  const recipes = new Map<number, RecipeLite>(
    recipeRows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        mealType: r.mealType,
        minutes: r.minutes,
        servings: r.servings,
        tags: r.tags,
        ingredients: byRecipe.get(r.id) ?? [],
      },
    ]),
  );

  const products = new Map<number, ProductLite>(
    productRows.map((p) => [
      p.id,
      {
        id: p.id,
        storeId: p.storeId,
        ingredientId: p.ingredientId,
        name: p.name,
        brand: p.brand,
        packSize: p.packSize,
        packUnit: p.packUnit,
        soldByWeight: p.soldByWeight,
      },
    ]),
  );

  const productsByIngredient = new Map<number, ProductLite[]>();
  for (const p of products.values()) {
    const list = productsByIngredient.get(p.ingredientId) ?? [];
    list.push(p);
    productsByIngredient.set(p.ingredientId, list);
  }
  const pricesByProduct = new Map<number, PriceLite[]>();
  for (const pr of priceRows) {
    const list = pricesByProduct.get(pr.productId) ?? [];
    list.push(pr);
    pricesByProduct.set(pr.productId, list);
  }

  const rules = ruleRows;
  const stapleNames = new Set(
    rules.filter((r) => r.kind === "staple").map((r) => r.value.toLowerCase()),
  );
  const staples = new Set<number>(
    [...ingredients.values()].filter((i) => stapleNames.has(i.name.toLowerCase())).map((i) => i.id),
  );

  return {
    ingredients,
    recipes,
    stores: storeRows,
    products,
    catalog: { productsByIngredient, pricesByProduct },
    pantry: pantryRows.map((p) => ({
      ingredientId: p.ingredientId,
      quantity: p.quantity,
      unit: p.unit,
    })),
    staples,
    avoid: rules
      .filter((r) => r.kind === "avoid" || r.kind === "allergy")
      .map((r) => r.value.toLowerCase()),
    favoriteIds: new Set(prefRows.filter((p) => p.status === "favorite").map((p) => p.recipeId)),
    discardedIds: new Set(prefRows.filter((p) => p.status === "discarded").map((p) => p.recipeId)),
    profile,
  };
}

/** Centimos por unidad base del mejor precio utilizable de cada ingrediente (para estimar costos de recetas). */
export function buildUnitCost(data: CatalogData, today: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const [ingredientId, products] of data.catalog.productsByIngredient) {
    let best: number | null = null;
    for (const p of products) {
      const resolved = pickBestPrice(data.catalog.pricesByProduct.get(p.id) ?? [], today);
      if (!resolved) continue;
      const perUnit = resolved.cents / p.packSize;
      if (best === null || perUnit < best) best = perUnit;
    }
    if (best !== null) out.set(ingredientId, best);
  }
  return out;
}
