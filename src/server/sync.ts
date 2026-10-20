import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { bestOptionInStore } from "@/lib/pricing";
import { buildNeeds, diffShoppingList, type Need, type PlanEntryLite } from "@/lib/shopping";
import { loadCatalog, type CatalogData } from "./catalog";

type Strategy = "esselunga" | "iper" | "split";

type PriceSelection = {
  productId: number | null;
  storeId: number | null;
  estPriceCents: number | null;
  priceStatus: "estimated" | "confirmed" | "unknown";
};

const UNKNOWN: PriceSelection = {
  productId: null,
  storeId: null,
  estPriceCents: null,
  priceStatus: "unknown",
};

export function selectPrice(
  ingredientId: number | null,
  toBuyQty: number,
  strategy: Strategy,
  data: CatalogData,
  today: string,
): PriceSelection {
  if (ingredientId === null || toBuyQty <= 0) return UNKNOWN;
  const item = { key: "x", ingredientId, name: "", toBuyQty };
  const candidates = data.stores.filter((st) => strategy === "split" || st.slug === strategy);
  let best: { opt: NonNullable<ReturnType<typeof bestOptionInStore>>; storeId: number } | null = null;
  for (const st of candidates) {
    const opt = bestOptionInStore(item, st.id, data.catalog, today);
    if (opt && (!best || opt.totalCents < best.opt.totalCents)) best = { opt, storeId: st.id };
  }
  if (!best) return UNKNOWN;
  return {
    productId: best.opt.product.id,
    storeId: best.storeId,
    estPriceCents: best.opt.totalCents,
    priceStatus: best.opt.resolved.record.confirmedByUser ? "confirmed" : "estimated",
  };
}

export async function getOrCreateList(planId: number): Promise<number> {
  const db = getDb();
  const existing = await db
    .select()
    .from(s.shoppingLists)
    .where(eq(s.shoppingLists.planId, planId))
    .limit(1);
  if (existing[0]) return existing[0].id;
  // "Dividir" toma el precio mas barato de cada producto entre las tiendas: lo natural cuando se compra segun ofertas.
  const [row] = await db.insert(s.shoppingLists).values({ planId, strategy: "split" }).returning();
  return row.id;
}

/** Recalcula la lista a partir del plan sin duplicar ni pisar cambios manuales. */
export async function syncShoppingList(planId: number): Promise<number> {
  const db = getDb();
  const data = await loadCatalog();
  const today = todayISO();
  const listId = await getOrCreateList(planId);
  const [list] = await db.select().from(s.shoppingLists).where(eq(s.shoppingLists.id, listId));
  if (list.status === "done") return listId;

  const entries = await db
    .select()
    .from(s.mealPlanEntries)
    .where(eq(s.mealPlanEntries.planId, planId));
  const planEntries: PlanEntryLite[] = entries.map((e) => ({
    recipeId: e.recipeId,
    servings: e.servings,
    status: e.status,
  }));

  const needs: Need[] = buildNeeds(planEntries, data.recipes, data.ingredients, data.pantry).filter(
    (n) => !data.staples.has(n.ingredientId),
  );

  const existing = await db.select().from(s.shoppingItems).where(eq(s.shoppingItems.listId, listId));
  const diff = diffShoppingList(
    existing.map((e) => ({
      id: e.id,
      ingredientId: e.ingredientId,
      isManual: e.isManual,
      checked: e.checked,
      qtyOverridden: e.qtyOverridden,
      removedAt: e.removedAt,
      neededQty: e.neededQty,
    })),
    needs,
  );
  const byId = new Map(existing.map((e) => [e.id, e]));

  await db.transaction(async (tx) => {
    for (const need of diff.insert) {
      const price = selectPrice(need.ingredientId, need.toBuyQty, list.strategy, data, today);
      await tx.insert(s.shoppingItems).values({
        listId,
        ingredientId: need.ingredientId,
        name: need.name,
        category: need.category,
        unit: need.unit,
        neededQty: need.neededQty,
        pantryQty: need.pantryQty,
        toBuyQty: need.toBuyQty,
        ...price,
      });
    }
    for (const { id, need } of diff.update) {
      const current = byId.get(id);
      if (!current || current.checked) continue;
      const toBuyQty = current.qtyOverridden ? current.toBuyQty : need.toBuyQty;
      const price = selectPrice(need.ingredientId, toBuyQty, list.strategy, data, today);
      await tx
        .update(s.shoppingItems)
        .set({
          neededQty: need.neededQty,
          pantryQty: need.pantryQty,
          toBuyQty,
          ...(current.realPriceCents === null ? price : { productId: price.productId, storeId: price.storeId }),
        })
        .where(eq(s.shoppingItems.id, id));
    }
    if (diff.remove.length > 0) {
      await tx.delete(s.shoppingItems).where(inArray(s.shoppingItems.id, diff.remove));
    }
  });
  return listId;
}

/** Recalcula precios de todos los items (al cambiar de estrategia o cargar precios nuevos). */
export async function repriceList(listId: number): Promise<void> {
  const db = getDb();
  const data = await loadCatalog();
  const today = todayISO();
  const [list] = await db.select().from(s.shoppingLists).where(eq(s.shoppingLists.id, listId));
  if (!list || list.status === "done") return;
  const items = await db
    .select()
    .from(s.shoppingItems)
    .where(and(eq(s.shoppingItems.listId, listId), isNull(s.shoppingItems.removedAt)));
  await db.transaction(async (tx) => {
    for (const it of items) {
      if (it.isManual || it.ingredientId === null || it.realPriceCents !== null) continue;
      const price = selectPrice(it.ingredientId, it.toBuyQty, list.strategy, data, today);
      await tx.update(s.shoppingItems).set(price).where(eq(s.shoppingItems.id, it.id));
    }
  });
}
