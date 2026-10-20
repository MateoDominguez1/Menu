"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { isValidISODate, todayISO } from "@/lib/dates";
import { requireAuth } from "./auth";
import { deleteOfferImport, importOffers, shoppingCategoryFor, type ImportResult } from "./offers";
import { getActivePlan } from "./queries";
import { getOrCreateList } from "./sync";

const id = z.number().int().positive();
const cents = z.number().int().min(0).max(10_000_000);
const date = z.string().refine(isValidISODate, "Fecha invalida");

const offerSchema = z.object({
  store: z.enum(["iper", "esselunga"]),
  page: z.number().int().min(0).max(500),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(80).nullable(),
  priceCents: cents,
  regularCents: cents.nullable(),
  discountPct: z.number().int().min(0).max(100).nullable(),
  unitPriceCents: cents.nullable(),
  unitPriceLabel: z.enum(["kg", "L"]).nullable(),
  perKg: z.boolean(),
  needsCard: z.boolean(),
  condition: z.string().max(400).nullable(),
  packSize: z.number().positive().max(1_000_000).nullable(),
  packUnit: z.enum(s.BASE_UNITS).nullable(),
  category: z.enum(s.OFFER_CATEGORIES),
});

const importSchema = z
  .object({
    storeSlug: z.enum(["iper", "esselunga"]),
    label: z.string().trim().min(1).max(120),
    validFrom: date.nullable(),
    validUntil: date,
    offers: z.array(offerSchema).min(1).max(2000),
  })
  .refine((v) => !v.validFrom || v.validFrom <= v.validUntil, "La fecha de inicio es posterior a la de fin");

export async function importOffersAction(input: z.input<typeof importSchema>): Promise<ImportResult> {
  await requireAuth();
  const v = importSchema.parse(input);
  const result = await importOffers({
    storeSlug: v.storeSlug,
    label: v.label,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
    offers: v.offers,
  });
  revalidatePath("/", "layout");
  return result;
}

export async function deleteOfferImportAction(importId: number): Promise<void> {
  await requireAuth();
  await deleteOfferImport(id.parse(importId));
  revalidatePath("/", "layout");
}

/** Si todavia no hay ningun plan, crea uno vacio para poder tener una lista de compras libre. */
async function ensurePlanId(): Promise<number> {
  const db = getDb();
  const { plan } = await getActivePlan();
  if (plan) return plan.id;
  const [prof] = await db.select().from(s.profile).where(eq(s.profile.id, 1));
  const [row] = await db
    .insert(s.mealPlans)
    .values({ weekStart: todayISO(), days: 7, budgetCents: prof?.weeklyBudgetCents ?? 5000, generator: "local" })
    .returning();
  return row.id;
}

const addSchema = z.object({
  offerId: id,
  /** Envases (o gramos si la oferta es por kg). */
  quantity: z.number().positive().max(100_000),
});

/** Agrega cualquier oferta a la lista de compras, aunque no pertenezca a ninguna receta. */
export async function addOfferToListAction(input: z.input<typeof addSchema>): Promise<{ itemId: number }> {
  await requireAuth();
  const v = addSchema.parse(input);
  const db = getDb();
  const [offer] = await db.select().from(s.offers).where(eq(s.offers.id, v.offerId));
  if (!offer) throw new Error("La oferta no existe");
  const planId = await ensurePlanId();
  const listId = await getOrCreateList(planId);
  const unit: s.BaseUnit = offer.perKg ? "g" : "unit";
  const qty = v.quantity;
  const priceCents = offer.perKg ? Math.round((offer.priceCents * qty) / 1000) : offer.priceCents * qty;
  const [row] = await db
    .insert(s.shoppingItems)
    .values({
      listId,
      offerId: offer.id,
      name: offer.brand ? `${offer.name} (${offer.brand})` : offer.name,
      category: shoppingCategoryFor(offer.category),
      unit,
      neededQty: qty,
      toBuyQty: qty,
      storeId: offer.storeId,
      estPriceCents: priceCents,
      priceStatus: "estimated",
      isManual: true,
      qtyOverridden: true,
    })
    .returning();
  revalidatePath("/", "layout");
  return { itemId: row.id };
}
