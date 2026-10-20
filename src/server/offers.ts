import { and, eq, gte, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { mapOfferToIngredient, toProductDraft } from "@/lib/flyer/mapping";
import type { ParsedOffer } from "@/lib/flyer/types";

export type ImportInput = {
  storeSlug: "iper" | "esselunga";
  label: string;
  validFrom: string | null;
  validUntil: string;
  offers: ParsedOffer[];
};

export type ImportResult = {
  importId: number;
  imported: number;
  duplicates: number;
  linkedToIngredients: number;
  productsCreated: number;
};

/** Categoria de la lista de compras que corresponde a una categoria de oferta. */
export function shoppingCategoryFor(cat: s.Offer["category"]): s.Category {
  switch (cat) {
    case "carne":
    case "pescado":
      return "carne_pescado";
    case "fiambres_quesos":
    case "lacteos_huevos":
      return "lacteos_huevos";
    case "fruta_verdura":
      return "fruta_verdura";
    case "pasta_arroz":
    case "pan_panaderia":
      return "pasta_arroz_cereales";
    case "congelados":
      return "congelados";
    default:
      return "conservas_secos";
  }
}

export async function importOffers(input: ImportInput): Promise<ImportResult> {
  const db = getDb();
  const stores = await db.select().from(s.stores);
  const store = stores.find((x) => x.slug === input.storeSlug);
  if (!store) throw new Error("Tienda inexistente");
  const ingredients = await db.select().from(s.ingredients);
  const ingByName = new Map(ingredients.map((i) => [i.name, i]));

  const existing = await db
    .select()
    .from(s.offers)
    .where(and(eq(s.offers.storeId, store.id), eq(s.offers.validUntil, input.validUntil)));
  const seen = new Set(existing.map((o) => `${o.name.toLowerCase()}|${o.priceCents}`));

  const [batch] = await db
    .insert(s.offerImports)
    .values({
      storeId: store.id,
      label: input.label,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      offerCount: 0,
    })
    .returning();

  let imported = 0;
  let duplicates = 0;
  let linked = 0;
  let productsCreated = 0;

  for (const o of input.offers) {
    const key = `${o.name.toLowerCase()}|${o.priceCents}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    const ingName = mapOfferToIngredient(o);
    const ing = ingName ? ingByName.get(ingName) : undefined;
    const draft = ing ? toProductDraft(o, ing.baseUnit) : null;

    await db.insert(s.offers).values({
      importId: batch.id,
      storeId: store.id,
      name: o.name,
      brand: o.brand,
      category: o.category,
      priceCents: o.priceCents,
      regularCents: o.regularCents,
      discountPct: o.discountPct,
      unitPriceCents: o.unitPriceCents,
      unitPriceLabel: o.unitPriceLabel,
      perKg: o.perKg,
      needsCard: o.needsCard,
      condition: o.condition,
      packSize: o.packSize,
      packUnit: o.packUnit,
      ingredientId: draft && ing ? ing.id : null,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      page: o.page,
    });
    imported += 1;

    if (draft && ing) {
      linked += 1;
      const name = o.brand ? `${o.name} (${o.brand})` : o.name;
      const found = (
        await db
          .select()
          .from(s.products)
          .where(and(eq(s.products.storeId, store.id), eq(s.products.ingredientId, ing.id), eq(s.products.name, name)))
      )[0];
      const productId =
        found?.id ??
        (
          await db
            .insert(s.products)
            .values({
              storeId: store.id,
              ingredientId: ing.id,
              name,
              brand: o.brand,
              packSize: draft.packSize,
              packUnit: draft.packUnit,
              soldByWeight: draft.soldByWeight,
            })
            .returning()
        )[0].id;
      if (!found) productsCreated += 1;
      const hasRegular = o.regularCents !== null && o.regularCents > o.priceCents;
      await db.insert(s.priceRecords).values({
        productId,
        priceCents: hasRegular ? (o.regularCents as number) : o.priceCents,
        promoPriceCents: hasRegular ? o.priceCents : null,
        promoConditions: o.condition,
        validUntil: input.validUntil,
        sourceKind: "flyer",
        sourceRef: `${input.label} p.${o.page}${o.needsCard ? " (requiere tarjeta)" : ""} [import #${batch.id}]`,
        observedAt: input.validFrom ?? new Date().toISOString().slice(0, 10),
        confirmedByUser: false,
        isEstimate: false,
      });
    }
  }

  await db.update(s.offerImports).set({ offerCount: imported }).where(eq(s.offerImports.id, batch.id));
  return { importId: batch.id, imported, duplicates, linkedToIngredients: linked, productsCreated };
}

/** Borra una importacion y los precios que genero (los productos creados quedan, sin precio vigente). */
export async function deleteOfferImport(importId: number): Promise<void> {
  const db = getDb();
  await db.delete(s.priceRecords).where(and(eq(s.priceRecords.sourceKind, "flyer"), like(s.priceRecords.sourceRef, `%[import #${importId}]`)));
  await db.delete(s.offerImports).where(eq(s.offerImports.id, importId));
}

export async function listOffers(today: string, includeExpired = false) {
  const db = getDb();
  const where = includeExpired ? undefined : gte(s.offers.validUntil, today);
  const [rows, stores, imports] = await Promise.all([
    where ? db.select().from(s.offers).where(where) : db.select().from(s.offers),
    db.select().from(s.stores),
    db.select().from(s.offerImports),
  ]);
  const storeName = new Map(stores.map((x) => [x.id, x.name]));
  return { rows: rows.map((o) => ({ ...o, storeName: storeName.get(o.storeId) ?? "" })), imports };
}
