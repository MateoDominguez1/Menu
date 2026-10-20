import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { todayISO } from "@/lib/dates";
import {
  compareBaskets,
  pickBestPrice,
  type Comparison,
  type PriceFreshness,
} from "@/lib/pricing";
import { recipeNutritionPerServing, sumNutrition, type Nutrition } from "@/lib/nutrition";
import { recipeCostPerServing } from "@/lib/planner";
import { buildNeeds } from "@/lib/shopping";
import { buildUnitCost, loadCatalog, type CatalogData } from "./catalog";
import { getOrCreateList } from "./sync";

export type RecipeCard = {
  id: number;
  name: string;
  minutes: number;
  mealType: s.Slot;
  costCents: number;
  costUnknown: number;
  nutrition: Nutrition;
  pref: "favorite" | "discarded" | null;
  /** Compuesta automaticamente segun las ofertas vigentes. */
  auto: boolean;
};

export function recipeCard(data: CatalogData, recipeId: number, today: string): RecipeCard | null {
  const r = data.recipes.get(recipeId);
  if (!r) return null;
  const cost = recipeCostPerServing(r, buildUnitCost(data, today));
  return {
    id: r.id,
    name: r.name,
    minutes: r.minutes,
    mealType: r.mealType,
    costCents: Math.round(cost.cents),
    costUnknown: cost.unknown,
    nutrition: recipeNutritionPerServing(r, data.ingredients),
    pref: data.favoriteIds.has(r.id) ? "favorite" : data.discardedIds.has(r.id) ? "discarded" : null,
    auto: r.tags.split(",").includes("auto"),
  };
}

export type EntryView = {
  id: number;
  date: string;
  slot: s.Slot;
  status: "planned" | "skipped" | "eaten";
  skipReason: "work" | "out" | "other" | null;
  servings: number;
  recipe: RecipeCard | null;
};

/** Plan pedido por id; si no, el que incluye hoy; si no, el mas reciente. */
export async function getActivePlan(planId?: number | null) {
  const db = getDb();
  const all = await db.select().from(s.mealPlans).orderBy(desc(s.mealPlans.weekStart), desc(s.mealPlans.id));
  if (planId) {
    const found = all.find((p) => p.id === planId);
    if (found) return { plan: found, all };
  }
  const today = todayISO();
  const current = all.find((p) => {
    const end = new Date(Date.parse(`${p.weekStart}T00:00:00Z`) + (p.days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return p.weekStart <= today && today <= end;
  });
  return { plan: current ?? all[0] ?? null, all };
}

export async function getEntryViews(planId: number, data: CatalogData): Promise<EntryView[]> {
  const db = getDb();
  const today = todayISO();
  const rows = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.planId, planId));
  const order: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  return rows
    .map((e) => ({
      id: e.id,
      date: e.date,
      slot: e.slot,
      status: e.status,
      skipReason: e.skipReason,
      servings: e.servings,
      recipe: e.recipeId ? recipeCard(data, e.recipeId, today) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || order[a.slot] - order[b.slot]);
}

export type ItemView = {
  id: number;
  ingredientId: number | null;
  name: string;
  category: s.Category;
  unit: s.BaseUnit;
  neededQty: number;
  pantryQty: number;
  toBuyQty: number;
  checked: boolean;
  isManual: boolean;
  removed: boolean;
  estPriceCents: number | null;
  realPriceCents: number | null;
  priceStatus: "estimated" | "confirmed" | "unknown";
  product: {
    id: number;
    name: string;
    brand: string | null;
    packSize: number;
    packUnit: s.BaseUnit;
    soldByWeight: boolean;
    storeName: string;
  } | null;
  priceInfo: {
    freshness: PriceFreshness;
    isEstimate: boolean;
    confirmedByUser: boolean;
    isPromo: boolean;
    observedAt: string;
    sourceRef: string | null;
  } | null;
};

export async function getListView(planId: number) {
  const db = getDb();
  const data = await loadCatalog();
  const today = todayISO();
  const listId = await getOrCreateList(planId);
  const [list] = await db.select().from(s.shoppingLists).where(eq(s.shoppingLists.id, listId));
  const rows = await db.select().from(s.shoppingItems).where(eq(s.shoppingItems.listId, listId));
  const storeName = new Map(data.stores.map((st) => [st.id, st.name]));

  const items: ItemView[] = rows.map((r) => {
    const p = r.productId ? data.products.get(r.productId) : undefined;
    const best = p ? pickBestPrice(data.catalog.pricesByProduct.get(p.id) ?? [], today) : null;
    return {
      id: r.id,
      ingredientId: r.ingredientId,
      name: r.name,
      category: r.category,
      unit: r.unit,
      neededQty: r.neededQty,
      pantryQty: r.pantryQty,
      toBuyQty: r.toBuyQty,
      checked: r.checked,
      isManual: r.isManual,
      removed: !!r.removedAt,
      estPriceCents: r.estPriceCents,
      realPriceCents: r.realPriceCents,
      priceStatus: r.priceStatus,
      product: p
        ? {
            id: p.id,
            name: p.name,
            brand: p.brand,
            packSize: p.packSize,
            packUnit: p.packUnit,
            soldByWeight: p.soldByWeight,
            storeName: storeName.get(p.storeId) ?? "",
          }
        : null,
      priceInfo: best
        ? {
            freshness: best.freshness,
            isEstimate: best.record.isEstimate,
            confirmedByUser: best.record.confirmedByUser,
            isPromo: best.isPromo,
            observedAt: best.record.observedAt,
            sourceRef: best.record.sourceRef,
          }
        : null,
    };
  });
  // Lo que el plan usa pero NO entra en la lista porque esta marcado como "siempre en casa".
  const entries = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.planId, planId));
  const stapleNeeds = buildNeeds(
    entries.map((e) => ({ recipeId: e.recipeId, servings: e.servings, status: e.status })),
    data.recipes,
    data.ingredients,
    data.pantry,
  )
    .filter((n) => data.staples.has(n.ingredientId) && n.toBuyQty > 0)
    .map((n) => ({ ingredientId: n.ingredientId, name: n.name }));
  return { list, items, data, stapleNeeds };
}

export function listTotals(items: ItemView[]) {
  const active = items.filter((i) => !i.removed && i.toBuyQty > 0);
  const priced = active.filter((i) => i.estPriceCents !== null);
  const estimated = priced.reduce((sum, i) => sum + (i.estPriceCents ?? 0), 0);
  const confirmedReal = active.reduce((sum, i) => sum + (i.checked ? (i.realPriceCents ?? 0) : 0), 0);
  const checked = active.filter((i) => i.checked);
  const checkedEstimated = checked.reduce((sum, i) => sum + (i.realPriceCents ?? i.estPriceCents ?? 0), 0);
  return {
    count: active.length,
    checkedCount: checked.length,
    unknownCount: active.length - priced.length,
    estimatedCents: estimated,
    realRecordedCents: confirmedReal,
    checkedEstimatedCents: checkedEstimated,
    progress: active.length === 0 ? 0 : Math.round((checked.length / active.length) * 100),
  };
}

export async function getComparison(planId: number): Promise<{
  comparison: Comparison;
  stores: s.Store[];
  data: CatalogData;
}> {
  const { items, data } = await getListView(planId);
  const today = todayISO();
  const basket = items
    .filter((i) => !i.removed && i.toBuyQty > 0)
    .map((i) => ({ key: String(i.id), ingredientId: i.ingredientId, name: i.name, toBuyQty: i.toBuyQty }));
  const comparison = compareBaskets(basket, data.stores, data.catalog, today, {
    travelCostCents: data.profile.travelCostCents,
    timePenaltyCents: data.profile.timePenaltyCents,
  });
  return { comparison, stores: data.stores, data };
}

export async function getTodayMeals(planId: number, data: CatalogData) {
  const today = todayISO();
  const entries = await getEntryViews(planId, data);
  const todays = entries.filter((e) => e.date === today);
  const nutrition = sumNutrition(
    todays.filter((e) => e.status !== "skipped" && e.recipe).map((e) => e.recipe!.nutrition),
  );
  return { today, entries: todays, nutrition };
}

export async function getHistory() {
  const db = getDb();
  const plans = await db.select().from(s.mealPlans).orderBy(desc(s.mealPlans.weekStart), desc(s.mealPlans.id));
  const lists = await db.select().from(s.shoppingLists);
  const items = await db.select().from(s.shoppingItems).where(isNull(s.shoppingItems.removedAt));
  return plans.map((p) => {
    const list = lists.find((l) => l.planId === p.id);
    const its = items.filter((i) => i.listId === list?.id && i.toBuyQty > 0);
    const estimated = its.reduce((sum, i) => sum + (i.estPriceCents ?? 0), 0);
    const real = its.reduce((sum, i) => sum + (i.realPriceCents ?? 0), 0);
    return {
      plan: p,
      list: list ?? null,
      estimatedCents: estimated,
      itemLineReal: real,
      actualCents: list?.actualTotalCents ?? null,
      boughtCount: its.filter((i) => i.checked).length,
      itemCount: its.length,
    };
  });
}
