import { databaseToken, databaseUrl } from "@/server/config";
import { createDb, type Db } from "./client";
import { runMigrations } from "./migrate";
import * as s from "./schema";
import {
  NUTRITION_SOURCE,
  ingredients as seedIngredients,
  products as seedProducts,
  profileRules,
  recipes as seedRecipes,
} from "./seed-data";

export async function seedDatabase(db: Db): Promise<{ seeded: boolean }> {
  const existing = await db.select().from(s.profile).limit(1);
  if (existing.length > 0) return { seeded: false };

  await db.insert(s.profile).values({
    id: 1,
    country: "IT",
    weeklyBudgetCents: 5000,
    goal: "equilibrada_perdida_grasa",
    cookMinutesPerMeal: 30,
    notes:
      "Comidas sencillas y economicas. Espacio de heladera limitado. Sin meal prep obligatorio.",
  });
  await db.insert(s.profileRules).values(profileRules);

  const storeRows = await db
    .insert(s.stores)
    .values([
      { slug: "esselunga", name: "Esselunga" },
      {
        slug: "iper",
        name: "Iper",
        notes:
          "Pendiente de confirmar la cadena exacta (Iper La grande i, Carrefour Iper, Ipercoop...). Sin precios cargados.",
      },
    ])
    .returning();
  const storeId = new Map(storeRows.map((r) => [r.slug, r.id]));

  const ingRows = await db
    .insert(s.ingredients)
    .values(
      seedIngredients.map((i) => ({
        name: i.name,
        category: i.category,
        baseUnit: i.baseUnit,
        gramsPerUnit: i.gramsPerUnit ?? null,
        kcal100: i.n?.[0] ?? null,
        protein100: i.n?.[1] ?? null,
        carbs100: i.n?.[2] ?? null,
        fat100: i.n?.[3] ?? null,
        nutritionSource: i.n ? NUTRITION_SOURCE : null,
        nutritionIsEstimate: true,
      })),
    )
    .returning();
  const ingId = new Map(ingRows.map((r) => [r.name, r.id]));

  for (const r of seedRecipes) {
    const [row] = await db
      .insert(s.recipes)
      .values({
        name: r.name,
        mealType: r.mealType,
        minutes: r.minutes,
        servings: 1,
        tags: r.tags,
        instructions: r.instructions,
      })
      .returning();
    await db.insert(s.recipeIngredients).values(
      r.items.map(([name, quantity]) => {
        const ingredientId = ingId.get(name);
        if (!ingredientId) throw new Error(`Ingrediente desconocido en receta "${r.name}": ${name}`);
        return { recipeId: row.id, ingredientId, quantity };
      }),
    );
  }

  for (const p of seedProducts) {
    const ingredientId = ingId.get(p.ingredient);
    const sid = storeId.get(p.store);
    if (!ingredientId || !sid) throw new Error(`Producto invalido: ${p.name}`);
    const [row] = await db
      .insert(s.products)
      .values({
        storeId: sid,
        ingredientId,
        name: p.name,
        brand: p.brand ?? null,
        packSize: p.packSize,
        packUnit: p.packUnit,
        soldByWeight: p.soldByWeight ?? false,
      })
      .returning();
    await db.insert(s.priceRecords).values({
      productId: row.id,
      priceCents: p.price.cents,
      promoPriceCents: p.price.promoCents ?? null,
      validUntil: p.price.validUntil ?? null,
      observedAt: p.price.observedAt,
      sourceKind: p.price.sourceKind,
      sourceRef: p.price.sourceRef,
      isEstimate: p.price.isEstimate,
      confirmedByUser: false,
    });
  }

  return { seeded: true };
}

export async function ensureDatabaseReady(url: string, authToken?: string) {
  await runMigrations(url, authToken);
  const { client, db } = createDb(url, authToken);
  const result = await seedDatabase(db);
  client.close();
  return result;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const url = databaseUrl();
  ensureDatabaseReady(url, databaseToken())
    .then((r) => console.log(r.seeded ? "Datos iniciales cargados" : "La base ya tenia datos: no se toco nada", "-", url))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
