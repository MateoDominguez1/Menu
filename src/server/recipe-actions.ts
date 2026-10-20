"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { toBaseQuantity } from "@/lib/units";
import { requireAuth } from "./auth";
import { loadCatalog } from "./catalog";
import { syncShoppingList } from "./sync";

const id = z.number().int().positive();

const recipeSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1).max(100),
  mealType: z.enum(s.SLOTS),
  minutes: z.number().int().min(1).max(600),
  servings: z.number().min(0.25).max(20),
  instructions: z.string().max(5000),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "La imagen debe ser una URL http(s)")
    .nullable()
    .optional(),
  tags: z.string().max(200).default(""),
  items: z
    .array(
      z.object({
        ingredientId: id,
        quantity: z.number().positive().max(1_000_000),
        unit: z.string().max(8),
      }),
    )
    .min(1, "La receta necesita al menos un ingrediente")
    .max(40),
});

/** Re-sincroniza las listas de todos los planes que usan la receta. */
async function resyncPlansUsing(recipeId: number) {
  const db = getDb();
  const rows = await db
    .select({ planId: s.mealPlanEntries.planId })
    .from(s.mealPlanEntries)
    .where(eq(s.mealPlanEntries.recipeId, recipeId));
  for (const planId of new Set(rows.map((r) => r.planId))) await syncShoppingList(planId);
}

export async function saveRecipeAction(input: z.input<typeof recipeSchema>): Promise<{ id: number }> {
  await requireAuth();
  const v = recipeSchema.parse(input);
  const data = await loadCatalog();
  const items = v.items.map((it) => {
    const ing = data.ingredients.get(it.ingredientId);
    if (!ing) throw new Error("Ingrediente inexistente");
    return { ingredientId: ing.id, quantity: toBaseQuantity(it.quantity, it.unit, ing) };
  });
  const seen = new Set<number>();
  for (const it of items) {
    if (seen.has(it.ingredientId)) throw new Error("Un ingrediente esta repetido: sumalo en una sola linea");
    seen.add(it.ingredientId);
  }

  const db = getDb();
  const base = {
    name: v.name,
    mealType: v.mealType,
    minutes: v.minutes,
    servings: v.servings,
    instructions: v.instructions,
    imageUrl: v.imageUrl ? v.imageUrl : null,
    tags: v.tags,
  };
  let recipeId: number;
  if (v.id) {
    recipeId = v.id;
    await db.update(s.recipes).set(base).where(eq(s.recipes.id, recipeId));
    await db.delete(s.recipeIngredients).where(eq(s.recipeIngredients.recipeId, recipeId));
  } else {
    const [row] = await db.insert(s.recipes).values(base).returning();
    recipeId = row.id;
  }
  await db.insert(s.recipeIngredients).values(items.map((it) => ({ recipeId, ...it })));
  await resyncPlansUsing(recipeId);
  revalidatePath("/", "layout");
  return { id: recipeId };
}

export async function duplicateRecipeAction(recipeId: number): Promise<{ id: number }> {
  await requireAuth();
  const rid = id.parse(recipeId);
  const db = getDb();
  const [src] = await db.select().from(s.recipes).where(eq(s.recipes.id, rid));
  if (!src) throw new Error("La receta no existe");
  const ings = await db.select().from(s.recipeIngredients).where(eq(s.recipeIngredients.recipeId, rid));
  const [copy] = await db
    .insert(s.recipes)
    .values({
      name: `${src.name} (copia)`,
      mealType: src.mealType,
      minutes: src.minutes,
      servings: src.servings,
      instructions: src.instructions,
      imageUrl: src.imageUrl,
      tags: src.tags,
    })
    .returning();
  if (ings.length > 0) {
    await db
      .insert(s.recipeIngredients)
      .values(ings.map((i) => ({ recipeId: copy.id, ingredientId: i.ingredientId, quantity: i.quantity, note: i.note })));
  }
  revalidatePath("/", "layout");
  return { id: copy.id };
}

export async function deleteRecipeAction(recipeId: number): Promise<void> {
  await requireAuth();
  const rid = id.parse(recipeId);
  const db = getDb();
  const rows = await db
    .select({ planId: s.mealPlanEntries.planId })
    .from(s.mealPlanEntries)
    .where(eq(s.mealPlanEntries.recipeId, rid));
  await db.delete(s.recipes).where(eq(s.recipes.id, rid));
  for (const planId of new Set(rows.map((r) => r.planId))) await syncShoppingList(planId);
  revalidatePath("/", "layout");
}

const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(s.CATEGORIES),
  baseUnit: z.enum(s.BASE_UNITS),
  gramsPerUnit: z.number().positive().max(100_000).nullable().optional(),
  nutrition: z
    .object({
      kcal: z.number().min(0).max(1000),
      protein: z.number().min(0).max(100),
      carbs: z.number().min(0).max(100),
      fat: z.number().min(0).max(100),
      fromLabel: z.boolean(),
    })
    .nullable()
    .optional(),
});

export async function createIngredientAction(input: z.input<typeof ingredientSchema>): Promise<{ id: number }> {
  await requireAuth();
  const v = ingredientSchema.parse(input);
  const db = getDb();
  const existing = (await db.select().from(s.ingredients)).find((i) => i.name.toLowerCase() === v.name.toLowerCase());
  if (existing) throw new Error("Ese ingrediente ya existe");
  const [row] = await db
    .insert(s.ingredients)
    .values({
      name: v.name,
      category: v.category,
      baseUnit: v.baseUnit,
      gramsPerUnit: v.gramsPerUnit ?? null,
      kcal100: v.nutrition?.kcal ?? null,
      protein100: v.nutrition?.protein ?? null,
      carbs100: v.nutrition?.carbs ?? null,
      fat100: v.nutrition?.fat ?? null,
      nutritionSource: v.nutrition ? (v.nutrition.fromLabel ? "Etiqueta (ingresada por el usuario)" : "Estimacion ingresada por el usuario") : null,
      nutritionIsEstimate: v.nutrition ? !v.nutrition.fromLabel : true,
    })
    .returning();
  revalidatePath("/", "layout");
  return { id: row.id };
}
