import { databaseToken, databaseUrl } from "@/server/config";
import { createDb, type Db } from "./client";
import { runMigrations } from "./migrate";
import * as s from "./schema";
import { and, eq } from "drizzle-orm";
import {
  IPER_STORE,
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
      { slug: "iper", name: IPER_STORE.name, notes: IPER_STORE.notes },
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

/**
 * Datos de referencia para bases que ya existian: actualiza la tienda Iper y agrega los productos
 * semilla que falten. Es idempotente y nunca pisa precios ni productos cargados por el usuario.
 */
/**
 * Correcciones de datos sembrados antes de leer el PDF oficial: un sitio de terceros daba las
 * patatas a 1,00 EUR por 2,5 kg y las uvas a 2,79; el volantino dice 2,45 y 2,59.
 */
const KNOWN_FIXES = [
  { product: "Patate a pasta gialla 2,5 kg", from: 100, to: 245, ref: "Volantino Iper La grande i 12-25 ott 2026 p.7 (PDF oficial): 0,98 EUR/kg, 2,45 EUR la bolsa; varia por local" },
  { product: "Uva bianca senza semi 1 kg", from: 279, to: 259, ref: "Volantino Iper La grande i 12-25 ott 2026 p.7 (PDF oficial)" },
];

export async function applyReferenceData(db: Db): Promise<{ added: number }> {
  const stores = await db.select().from(s.stores);
  const iper = stores.find((x) => x.slug === "iper");
  if (iper && iper.name !== IPER_STORE.name) {
    await db.update(s.stores).set({ name: IPER_STORE.name, notes: IPER_STORE.notes }).where(eq(s.stores.id, iper.id));
  }
  const storeId = new Map(stores.map((x) => [x.slug, x.id]));
  const ingId = new Map((await db.select().from(s.ingredients)).map((i) => [i.name, i.id]));

  if (iper) {
    for (const fix of KNOWN_FIXES) {
      const prods = await db
        .select()
        .from(s.products)
        .where(and(eq(s.products.storeId, iper.id), eq(s.products.name, fix.product)));
      for (const p of prods) {
        await db
          .update(s.priceRecords)
          .set({ priceCents: fix.to, sourceRef: fix.ref })
          .where(
            and(
              eq(s.priceRecords.productId, p.id),
              eq(s.priceRecords.priceCents, fix.from),
              eq(s.priceRecords.confirmedByUser, false),
            ),
          );
      }
    }
  }
  let added = 0;
  for (const p of seedProducts) {
    const sid = storeId.get(p.store);
    const iid = ingId.get(p.ingredient);
    if (!sid || !iid) continue;
    const found = await db
      .select()
      .from(s.products)
      .where(and(eq(s.products.storeId, sid), eq(s.products.ingredientId, iid), eq(s.products.name, p.name)))
      .limit(1);
    if (found.length > 0) continue;
    const [row] = await db
      .insert(s.products)
      .values({
        storeId: sid,
        ingredientId: iid,
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
    added += 1;
  }
  return { added };
}

export async function ensureDatabaseReady(url: string, authToken?: string) {
  await runMigrations(url, authToken);
  const { client, db } = createDb(url, authToken);
  const result = await seedDatabase(db);
  await applyReferenceData(db);
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
