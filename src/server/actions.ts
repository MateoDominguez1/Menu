"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { isValidISODate, todayISO } from "@/lib/dates";
import { toBaseQuantity } from "@/lib/units";
import {
  SESSION_COOKIE,
  authEnabled,
  passwordMatches,
  requireAuth,
  sessionToken,
} from "./auth";
import { loadCatalog } from "./catalog";
import { parsePricesCsv } from "./csv-prices";
import { alternativesFor, generateWeekPlan } from "./plans";
import { repriceList, syncShoppingList } from "./sync";

const id = z.number().int().positive();
const date = z.string().refine(isValidISODate, "Fecha invalida");
const slot = z.enum(s.SLOTS);
const unit = z.enum(s.BASE_UNITS);
const category = z.enum(s.CATEGORIES);
const cents = z.number().int().min(0).max(10_000_000);

function refreshAll() {
  revalidatePath("/", "layout");
}

async function listIdForEntry(entryId: number): Promise<number> {
  const db = getDb();
  const [entry] = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.id, entryId));
  if (!entry) throw new Error("La comida no existe");
  return entry.planId;
}

/* ------------------------------- Acceso ------------------------------- */

export async function loginAction(password: string): Promise<{ ok: boolean }> {
  if (!authEnabled()) return { ok: process.env.NODE_ENV !== "production" };
  if (!passwordMatches(password)) return { ok: false };
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* -------------------------------- Plan -------------------------------- */

const generateSchema = z.object({
  weekStart: date,
  days: z.number().int().min(1).max(14),
  budgetCents: cents,
  skips: z.array(z.object({ date, slot, reason: z.enum(["work", "out", "other"]) })).max(200),
});

export async function generatePlanAction(input: z.input<typeof generateSchema>) {
  await requireAuth();
  const v = generateSchema.parse(input);
  const result = await generateWeekPlan({ ...v, seed: Date.now() % 100000 });
  refreshAll();
  return result;
}

export async function getAlternativesAction(entryId: number) {
  await requireAuth();
  return alternativesFor(id.parse(entryId));
}

export async function swapEntryAction(input: { entryId: number; recipeId: number }) {
  await requireAuth();
  const v = z.object({ entryId: id, recipeId: id }).parse(input);
  const db = getDb();
  const planId = await listIdForEntry(v.entryId);
  await db
    .update(s.mealPlanEntries)
    .set({ recipeId: v.recipeId, status: "planned", skipReason: null })
    .where(eq(s.mealPlanEntries.id, v.entryId));
  await syncShoppingList(planId);
  refreshAll();
}

export async function clearEntryAction(entryId: number) {
  await requireAuth();
  const eid = id.parse(entryId);
  const db = getDb();
  const planId = await listIdForEntry(eid);
  await db.update(s.mealPlanEntries).set({ recipeId: null }).where(eq(s.mealPlanEntries.id, eid));
  await syncShoppingList(planId);
  refreshAll();
}

export async function setServingsAction(input: { entryId: number; servings: number }) {
  await requireAuth();
  const v = z.object({ entryId: id, servings: z.number().min(0.25).max(12) }).parse(input);
  const db = getDb();
  const planId = await listIdForEntry(v.entryId);
  await db.update(s.mealPlanEntries).set({ servings: v.servings }).where(eq(s.mealPlanEntries.id, v.entryId));
  await syncShoppingList(planId);
  refreshAll();
}

export async function setSkipAction(input: {
  entryId: number;
  skip: boolean;
  reason?: "work" | "out" | "other";
}) {
  await requireAuth();
  const v = z
    .object({ entryId: id, skip: z.boolean(), reason: z.enum(["work", "out", "other"]).optional() })
    .parse(input);
  const db = getDb();
  const planId = await listIdForEntry(v.entryId);
  await db
    .update(s.mealPlanEntries)
    .set(
      v.skip
        ? { status: "skipped", skipReason: v.reason ?? "other" }
        : { status: "planned", skipReason: null },
    )
    .where(eq(s.mealPlanEntries.id, v.entryId));
  await syncShoppingList(planId);
  refreshAll();
}

export async function duplicateEntryAction(input: { entryId: number; toDate: string; slot: s.Slot }) {
  await requireAuth();
  const v = z.object({ entryId: id, toDate: date, slot }).parse(input);
  const db = getDb();
  const [src] = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.id, v.entryId));
  if (!src) throw new Error("La comida no existe");
  const [target] = await db
    .select()
    .from(s.mealPlanEntries)
    .where(
      and(
        eq(s.mealPlanEntries.planId, src.planId),
        eq(s.mealPlanEntries.date, v.toDate),
        eq(s.mealPlanEntries.slot, v.slot),
      ),
    );
  if (target) {
    await db
      .update(s.mealPlanEntries)
      .set({ recipeId: src.recipeId, servings: src.servings, status: "planned", skipReason: null })
      .where(eq(s.mealPlanEntries.id, target.id));
  } else {
    await db.insert(s.mealPlanEntries).values({
      planId: src.planId,
      date: v.toDate,
      slot: v.slot,
      recipeId: src.recipeId,
      servings: src.servings,
    });
  }
  await syncShoppingList(src.planId);
  refreshAll();
}

/** Marcar una comida como comida descuenta sus ingredientes de la despensa una sola vez. */
export async function setEatenAction(input: { entryId: number; eaten: boolean }) {
  await requireAuth();
  const v = z.object({ entryId: id, eaten: z.boolean() }).parse(input);
  const db = getDb();
  const [entry] = await db.select().from(s.mealPlanEntries).where(eq(s.mealPlanEntries.id, v.entryId));
  if (!entry) throw new Error("La comida no existe");
  const wasEaten = entry.status === "eaten";
  if (wasEaten === v.eaten) return;
  if (entry.recipeId !== null) {
    const data = await loadCatalog();
    const recipe = data.recipes.get(entry.recipeId);
    const factor = entry.servings / (recipe?.servings || 1);
    for (const ri of recipe?.ingredients ?? []) {
      const delta = (v.eaten ? -1 : 1) * ri.quantity * factor;
      const rows = await db
        .select()
        .from(s.pantryItems)
        .where(eq(s.pantryItems.ingredientId, ri.ingredientId));
      if (rows.length === 0) continue;
      let remaining = -delta;
      for (const row of rows) {
        if (delta >= 0) {
          await db
            .update(s.pantryItems)
            .set({ quantity: row.quantity + delta })
            .where(eq(s.pantryItems.id, row.id));
          break;
        }
        const take = Math.min(row.quantity, remaining);
        await db
          .update(s.pantryItems)
          .set({ quantity: row.quantity - take })
          .where(eq(s.pantryItems.id, row.id));
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
  }
  await db
    .update(s.mealPlanEntries)
    .set({ status: v.eaten ? "eaten" : "planned" })
    .where(eq(s.mealPlanEntries.id, v.entryId));
  refreshAll();
}

export async function setRecipePrefAction(input: {
  recipeId: number;
  status: "favorite" | "discarded" | null;
}) {
  await requireAuth();
  const v = z.object({ recipeId: id, status: z.enum(["favorite", "discarded"]).nullable() }).parse(input);
  const db = getDb();
  if (v.status === null) {
    await db.delete(s.recipePrefs).where(eq(s.recipePrefs.recipeId, v.recipeId));
  } else {
    await db
      .insert(s.recipePrefs)
      .values({ recipeId: v.recipeId, status: v.status })
      .onConflictDoUpdate({ target: s.recipePrefs.recipeId, set: { status: v.status } });
  }
  refreshAll();
}

/* --------------------------- Lista de compras --------------------------- */

export async function toggleItemAction(input: { itemId: number; checked: boolean }) {
  await requireAuth();
  const v = z.object({ itemId: id, checked: z.boolean() }).parse(input);
  await getDb()
    .update(s.shoppingItems)
    .set({ checked: v.checked, checkedAt: v.checked ? new Date().toISOString() : null })
    .where(eq(s.shoppingItems.id, v.itemId));
  revalidatePath("/shopping");
  revalidatePath("/");
}

const updateItemSchema = z.object({
  itemId: id,
  toBuyQty: z.number().min(0).max(1_000_000).optional(),
  estPriceCents: cents.nullable().optional(),
  realPriceCents: cents.nullable().optional(),
});

export async function updateItemAction(input: z.input<typeof updateItemSchema>) {
  await requireAuth();
  const v = updateItemSchema.parse(input);
  const db = getDb();
  const [item] = await db.select().from(s.shoppingItems).where(eq(s.shoppingItems.id, v.itemId));
  if (!item) throw new Error("El producto no existe");
  const patch: Partial<typeof s.shoppingItems.$inferInsert> = {};
  if (v.toBuyQty !== undefined) {
    patch.toBuyQty = v.toBuyQty;
    patch.qtyOverridden = true;
  }
  if (v.estPriceCents !== undefined) {
    patch.estPriceCents = v.estPriceCents;
    patch.priceStatus = v.estPriceCents === null ? "unknown" : "estimated";
  }
  if (v.realPriceCents !== undefined) {
    patch.realPriceCents = v.realPriceCents;
    if (v.realPriceCents !== null) patch.priceStatus = "confirmed";
  }
  await db.update(s.shoppingItems).set(patch).where(eq(s.shoppingItems.id, v.itemId));
  if (v.toBuyQty !== undefined) await repriceList(item.listId);
  refreshAll();
}

const addManualSchema = z.object({
  listId: id,
  name: z.string().trim().min(1).max(80),
  quantity: z.number().min(0).max(1_000_000),
  unit,
  category,
  priceCents: cents.nullable().optional(),
});

export async function addManualItemAction(input: z.input<typeof addManualSchema>) {
  await requireAuth();
  const v = addManualSchema.parse(input);
  await getDb().insert(s.shoppingItems).values({
    listId: v.listId,
    name: v.name,
    category: v.category,
    unit: v.unit,
    neededQty: v.quantity,
    toBuyQty: v.quantity,
    estPriceCents: v.priceCents ?? null,
    priceStatus: v.priceCents == null ? "unknown" : "estimated",
    isManual: true,
    qtyOverridden: true,
  });
  refreshAll();
}

/** Eliminar un producto no toca el plan de comidas: se marca y sync no lo vuelve a agregar. */
export async function removeItemAction(itemId: number) {
  await requireAuth();
  await getDb()
    .update(s.shoppingItems)
    .set({ removedAt: new Date().toISOString() })
    .where(eq(s.shoppingItems.id, id.parse(itemId)));
  refreshAll();
}

export async function restoreItemAction(itemId: number) {
  await requireAuth();
  await getDb()
    .update(s.shoppingItems)
    .set({ removedAt: null })
    .where(eq(s.shoppingItems.id, id.parse(itemId)));
  refreshAll();
}

export async function setStrategyAction(input: { listId: number; strategy: "esselunga" | "iper" | "split" }) {
  await requireAuth();
  const v = z.object({ listId: id, strategy: z.enum(["esselunga", "iper", "split"]) }).parse(input);
  await getDb().update(s.shoppingLists).set({ strategy: v.strategy }).where(eq(s.shoppingLists.id, v.listId));
  await repriceList(v.listId);
  refreshAll();
}

/** El usuario confirma el precio de estante de un producto: se guarda como precio confirmado. */
export async function confirmShelfPriceAction(input: { itemId: number; priceCents: number }) {
  await requireAuth();
  const v = z.object({ itemId: id, priceCents: cents }).parse(input);
  const db = getDb();
  const [item] = await db.select().from(s.shoppingItems).where(eq(s.shoppingItems.id, v.itemId));
  if (!item?.productId) throw new Error("Este producto no tiene un producto de supermercado asociado");
  await db.insert(s.priceRecords).values({
    productId: item.productId,
    priceCents: v.priceCents,
    sourceKind: "user_confirmed",
    sourceRef: "Confirmado en el supermercado",
    observedAt: todayISO(),
    confirmedByUser: true,
    isEstimate: false,
  });
  await repriceList(item.listId);
  refreshAll();
}

export async function finishShoppingAction(input: { listId: number; actualTotalCents: number | null }) {
  await requireAuth();
  const v = z.object({ listId: id, actualTotalCents: cents.nullable() }).parse(input);
  const db = getDb();
  const [list] = await db.select().from(s.shoppingLists).where(eq(s.shoppingLists.id, v.listId));
  if (!list) throw new Error("La lista no existe");
  if (!list.inventoryApplied) {
    const data = await loadCatalog();
    const items = await db
      .select()
      .from(s.shoppingItems)
      .where(and(eq(s.shoppingItems.listId, v.listId), eq(s.shoppingItems.checked, true), isNull(s.shoppingItems.removedAt)));
    for (const it of items) {
      const product = it.productId ? data.products.get(it.productId) : undefined;
      const bought =
        product && !product.soldByWeight && product.packUnit === it.unit
          ? Math.ceil(it.toBuyQty / product.packSize - 1e-9) * product.packSize
          : it.toBuyQty;
      if (bought <= 0) continue;
      const existing = it.ingredientId
        ? (await db.select().from(s.pantryItems).where(eq(s.pantryItems.ingredientId, it.ingredientId)))[0]
        : undefined;
      if (existing && existing.unit === it.unit) {
        await db
          .update(s.pantryItems)
          .set({ quantity: existing.quantity + bought })
          .where(eq(s.pantryItems.id, existing.id));
      } else {
        await db.insert(s.pantryItems).values({
          ingredientId: it.ingredientId,
          name: it.name,
          quantity: bought,
          unit: it.unit,
          category: it.category,
          location: "despensa",
        });
      }
    }
  }
  await db
    .update(s.shoppingLists)
    .set({ status: "done", actualTotalCents: v.actualTotalCents, inventoryApplied: true })
    .where(eq(s.shoppingLists.id, v.listId));
  refreshAll();
}

export async function reopenListAction(listId: number) {
  await requireAuth();
  await getDb()
    .update(s.shoppingLists)
    .set({ status: "open" })
    .where(eq(s.shoppingLists.id, id.parse(listId)));
  refreshAll();
}

/* ------------------------------- Despensa ------------------------------- */

const pantrySchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(80),
  ingredientId: id.nullable().optional(),
  quantity: z.number().min(0).max(1_000_000),
  inputUnit: z.string().max(8).default("g"),
  unit: unit,
  category,
  location: z.enum(s.LOCATIONS),
  expiresOn: z.string().refine((v) => v === "" || isValidISODate(v)).nullable().optional(),
});

export async function savePantryItemAction(input: z.input<typeof pantrySchema>) {
  await requireAuth();
  const v = pantrySchema.parse(input);
  const db = getDb();
  const data = await loadCatalog();
  const ing = v.ingredientId ? data.ingredients.get(v.ingredientId) : undefined;
  const quantity = ing
    ? toBaseQuantity(v.quantity, v.inputUnit, ing)
    : toBaseQuantity(v.quantity, v.inputUnit, { baseUnit: v.unit });
  const values = {
    name: ing?.name ?? v.name,
    ingredientId: ing?.id ?? null,
    quantity,
    unit: ing?.baseUnit ?? v.unit,
    category: ing?.category ?? v.category,
    location: v.location,
    expiresOn: v.expiresOn ? v.expiresOn : null,
  };
  if (v.id) await db.update(s.pantryItems).set(values).where(eq(s.pantryItems.id, v.id));
  else await db.insert(s.pantryItems).values(values);
  refreshAll();
}

export async function deletePantryItemAction(itemId: number) {
  await requireAuth();
  await getDb().delete(s.pantryItems).where(eq(s.pantryItems.id, id.parse(itemId)));
  refreshAll();
}

/* ------------------------------- Ajustes ------------------------------- */

const profileSchema = z.object({
  weeklyBudgetCents: cents,
  goal: z.string().trim().min(1).max(120),
  kcalTarget: z.number().int().min(0).max(10000).nullable(),
  proteinTargetG: z.number().int().min(0).max(500).nullable(),
  cookMinutesPerMeal: z.number().int().min(5).max(240),
  fridgeLimited: z.boolean(),
  planBreakfast: z.boolean(),
  planLunch: z.boolean(),
  planDinner: z.boolean(),
  planSnacks: z.boolean(),
  mealPrepRequired: z.boolean(),
  travelCostCents: cents,
  timePenaltyCents: cents,
  notes: z.string().max(500).nullable(),
});

export async function updateProfileAction(input: z.input<typeof profileSchema>) {
  await requireAuth();
  const v = profileSchema.parse(input);
  await getDb().update(s.profile).set(v).where(eq(s.profile.id, 1));
  refreshAll();
}

export async function addRuleAction(input: { kind: "allergy" | "avoid" | "restriction" | "staple"; value: string }) {
  await requireAuth();
  const v = z
    .object({ kind: z.enum(["allergy", "avoid", "restriction", "staple"]), value: z.string().trim().min(1).max(60) })
    .parse(input);
  await getDb().insert(s.profileRules).values(v);
  refreshAll();
}

export async function deleteRuleAction(ruleId: number) {
  await requireAuth();
  await getDb().delete(s.profileRules).where(eq(s.profileRules.id, id.parse(ruleId)));
  refreshAll();
}

/* -------------------------------- Precios -------------------------------- */

const addPriceSchema = z.object({
  productId: id,
  priceCents: cents,
  promoPriceCents: cents.nullable().optional(),
  validUntil: z.string().refine((v) => v === "" || isValidISODate(v)).nullable().optional(),
  confirmed: z.boolean().default(true),
});

export async function addPriceAction(input: z.input<typeof addPriceSchema>) {
  await requireAuth();
  const v = addPriceSchema.parse(input);
  await getDb().insert(s.priceRecords).values({
    productId: v.productId,
    priceCents: v.priceCents,
    promoPriceCents: v.promoPriceCents ?? null,
    validUntil: v.validUntil ? v.validUntil : null,
    sourceKind: v.confirmed ? "user_confirmed" : "manual",
    sourceRef: v.confirmed ? "Cargado y confirmado por el usuario" : "Carga manual",
    observedAt: todayISO(),
    confirmedByUser: v.confirmed,
    isEstimate: false,
  });
  refreshAll();
}

export async function importPricesCsvAction(csv: string): Promise<{ imported: number; errors: string[] }> {
  await requireAuth();
  const text = z.string().max(500_000).parse(csv);
  const db = getDb();
  const data = await loadCatalog();
  const parsed = parsePricesCsv(
    text,
    new Map(data.stores.map((st) => [st.slug, st.id])),
    new Map([...data.ingredients.values()].map((i) => [i.name.toLowerCase(), i])),
  );
  let imported = 0;
  for (const row of parsed.rows) {
    const existing = (
      await db
        .select()
        .from(s.products)
        .where(
          and(
            eq(s.products.storeId, row.storeId),
            eq(s.products.ingredientId, row.ingredientId),
            eq(s.products.name, row.productName),
          ),
        )
    )[0];
    const productId =
      existing?.id ??
      (
        await db
          .insert(s.products)
          .values({
            storeId: row.storeId,
            ingredientId: row.ingredientId,
            name: row.productName,
            brand: row.brand,
            packSize: row.packSize,
            packUnit: row.packUnit,
            soldByWeight: row.soldByWeight,
          })
          .returning()
      )[0].id;
    await db.insert(s.priceRecords).values({
      productId,
      priceCents: row.priceCents,
      promoPriceCents: row.promoCents,
      validUntil: row.validUntil,
      sourceKind: "csv",
      sourceRef: row.source,
      observedAt: row.observedAt,
      confirmedByUser: false,
      isEstimate: false,
    });
    imported += 1;
  }
  refreshAll();
  return { imported, errors: parsed.errors };
}
