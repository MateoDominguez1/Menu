import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

let dir: string;
type Mods = {
  s: typeof import("@/db/schema");
  db: ReturnType<typeof import("@/db/client").getDb>;
  plans: typeof import("./plans");
  sync: typeof import("./sync");
  actions: typeof import("./actions");
  q: typeof import("./queries");
  eq: typeof import("drizzle-orm").eq;
};
let m: Mods;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mealplanner-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db").replaceAll("\\", "/")}`;
  delete process.env.APP_PASSWORD;
  delete process.env.ANTHROPIC_API_KEY;
  const { ensureDb } = await import("./bootstrap");
  await ensureDb();
  const { getDb } = await import("@/db/client");
  m = {
    s: await import("@/db/schema"),
    db: getDb(),
    plans: await import("./plans"),
    sync: await import("./sync"),
    actions: await import("./actions"),
    q: await import("./queries"),
    eq: (await import("drizzle-orm")).eq,
  };
}, 60_000);

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows puede mantener el archivo abierto */
  }
});

const SKIPS = (d: string) => [{ date: d, slot: "lunch" as const, reason: "work" as const }];

async function items(listId: number) {
  return m.db.select().from(m.s.shoppingItems).where(m.eq(m.s.shoppingItems.listId, listId));
}

describe("plan y lista de compras sobre base real", () => {
  it("la base inicial trae perfil, recetas, tiendas y precios con origen", async () => {
    const data = await (await import("./catalog")).loadCatalog();
    expect(data.recipes.size).toBeGreaterThan(15);
    expect(data.stores.map((x) => x.slug)).toEqual(["esselunga", "iper"]);
    const prices = await m.db.select().from(m.s.priceRecords);
    expect(prices.every((p) => !!p.sourceRef && !!p.observedAt)).toBe(true);
    expect(prices.some((p) => p.isEstimate)).toBe(true);
  });

  it("genera el plan, marca comidas omitidas y arma la lista sin ingredientes duplicados", async () => {
    const r = await m.plans.generateWeekPlan({
      weekStart: "2030-01-07",
      days: 4,
      budgetCents: 4300,
      skips: SKIPS("2030-01-08"),
      seed: 1,
    });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    expect(entries).toHaveLength(8); // 4 dias x (almuerzo + cena)
    const skipped = entries.find((e) => e.date === "2030-01-08" && e.slot === "lunch")!;
    expect(skipped.status).toBe("skipped");
    expect(skipped.recipeId).toBeNull();

    const rows = await items(r.listId);
    const ids = rows.map((x) => x.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.length).toBeGreaterThan(3);
  });

  it("nunca incluye recetas con ingredientes a evitar", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-02-04", days: 7, budgetCents: 4300, skips: [], seed: 3 });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    const names = new Set<string>();
    for (const e of entries) {
      if (!e.recipeId) continue;
      const [rec] = await m.db.select().from(m.s.recipes).where(m.eq(m.s.recipes.id, e.recipeId));
      names.add(rec.name.toLowerCase());
    }
    expect([...names].some((n) => /brocoli|berenjena|zucchini|calabacin/.test(n))).toBe(false);
  });

  it("cambiar UNA comida actualiza la lista, conserva lo comprado y no duplica", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-03-04", days: 3, budgetCents: 4300, skips: [], seed: 5 });
    const before = await items(r.listId);
    const first = before[0];
    await m.actions.toggleItemAction({ itemId: first.id, checked: true });

    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    const target = entries.find((e) => e.recipeId)!;
    const others = entries.filter((e) => e.id !== target.id).map((e) => e.recipeId);
    const alts = await m.plans.alternativesFor(target.id);
    expect(alts.length).toBeGreaterThan(0);
    await m.actions.swapEntryAction({ entryId: target.id, recipeId: alts[0].id });

    const afterEntries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    expect(afterEntries.filter((e) => e.id !== target.id).map((e) => e.recipeId)).toEqual(others);

    const after = await items(r.listId);
    const ids = after.map((x) => x.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(after.find((x) => x.id === first.id)?.checked).toBe(true);
  });

  it("un producto eliminado a mano no vuelve a aparecer al re-sincronizar", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-04-01", days: 3, budgetCents: 4300, skips: [], seed: 2 });
    const rows = await items(r.listId);
    const victim = rows[0];
    await m.actions.removeItemAction(victim.id);
    await m.sync.syncShoppingList(r.planId);
    const after = await items(r.listId);
    const same = after.filter((x) => x.ingredientId === victim.ingredientId);
    expect(same).toHaveLength(1);
    expect(same[0].removedAt).not.toBeNull();
  });

  it("la despensa descuenta lo necesario y se puede corregir", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-05-06", days: 3, budgetCents: 4300, skips: [], seed: 4 });
    const rows = await items(r.listId);
    const target = rows.find((x) => x.unit === "g" && x.neededQty > 0)!;
    await m.actions.savePantryItemAction({
      name: target.name,
      ingredientId: target.ingredientId,
      quantity: 10,
      inputUnit: "kg",
      unit: "g",
      category: target.category,
      location: "despensa",
    });
    await m.sync.syncShoppingList(r.planId);
    const after = (await items(r.listId)).find((x) => x.id === target.id)!;
    expect(after.pantryQty).toBeGreaterThan(0);
    expect(after.toBuyQty).toBe(0);
  });

  it("terminar la compra suma a la despensa una sola vez aunque se repita", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-06-03", days: 3, budgetCents: 4300, skips: [], seed: 6 });
    const rows = await items(r.listId);
    const pick = rows.find((x) => x.toBuyQty > 0)!;
    await m.actions.toggleItemAction({ itemId: pick.id, checked: true });
    const readStock = async () => {
      const p = await m.db.select().from(m.s.pantryItems).where(m.eq(m.s.pantryItems.ingredientId, pick.ingredientId!));
      return p.reduce((sum, x) => sum + x.quantity, 0);
    };
    const start = await readStock();
    await m.actions.finishShoppingAction({ listId: r.listId, actualTotalCents: 2500 });
    const once = await readStock();
    expect(once).toBeGreaterThan(start);
    await m.actions.reopenListAction(r.listId);
    await m.actions.finishShoppingAction({ listId: r.listId, actualTotalCents: 2500 });
    expect(await readStock()).toBe(once);
    const [list] = await m.db.select().from(m.s.shoppingLists).where(m.eq(m.s.shoppingLists.id, r.listId));
    expect(list.actualTotalCents).toBe(2500);
  });

  it("marcar una comida como comida descuenta la despensa una sola vez", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-07-01", days: 2, budgetCents: 4300, skips: [], seed: 8 });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    const entry = entries.find((e) => e.recipeId)!;
    const data = await (await import("./catalog")).loadCatalog();
    const recipe = data.recipes.get(entry.recipeId!)!;
    const ri = recipe.ingredients[0];
    const ing = data.ingredients.get(ri.ingredientId)!;
    await m.db.insert(m.s.pantryItems).values({
      ingredientId: ing.id,
      name: ing.name,
      quantity: 5000,
      unit: ing.baseUnit,
      category: ing.category,
      location: "despensa",
    });
    const stock = async () =>
      (await m.db.select().from(m.s.pantryItems).where(m.eq(m.s.pantryItems.ingredientId, ing.id))).reduce(
        (sum, x) => sum + x.quantity,
        0,
      );
    const start = await stock();
    await m.actions.setEatenAction({ entryId: entry.id, eaten: true });
    const after = await stock();
    expect(after).toBeLessThan(start);
    await m.actions.setEatenAction({ entryId: entry.id, eaten: true });
    expect(await stock()).toBe(after);
    await m.actions.setEatenAction({ entryId: entry.id, eaten: false });
    expect(await stock()).toBeCloseTo(start);
  });

  it("confirmar un precio de estante lo guarda como confirmado y la lista lo usa", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2030-08-05", days: 3, budgetCents: 4300, skips: [], seed: 9 });
    const rows = await items(r.listId);
    const withProduct = rows.find((x) => x.productId && x.toBuyQty > 0)!;
    await m.actions.confirmShelfPriceAction({ itemId: withProduct.id, priceCents: 777 });
    const after = (await items(r.listId)).find((x) => x.id === withProduct.id)!;
    expect(after.priceStatus).toBe("confirmed");
    const recs = await m.db.select().from(m.s.priceRecords).where(m.eq(m.s.priceRecords.productId, withProduct.productId!));
    expect(recs.some((x) => x.confirmedByUser && x.priceCents === 777)).toBe(true);
  });

  it("rechaza datos invalidos en las acciones", async () => {
    await expect(m.actions.setServingsAction({ entryId: 1, servings: -3 })).rejects.toThrow();
    await expect(
      m.actions.generatePlanAction({ weekStart: "no-fecha", days: 3, budgetCents: 100, skips: [] }),
    ).rejects.toThrow();
  });

  it("editar una receta actualiza la lista de compras de los planes que la usan", async () => {
    const rec = await import("./recipe-actions");
    const data = await (await import("./catalog")).loadCatalog();
    const pasta = [...data.ingredients.values()].find((i) => i.name === "Pasta seca")!;
    const huevos = [...data.ingredients.values()].find((i) => i.name === "Huevos")!;

    const created = await rec.saveRecipeAction({
      name: "Receta de prueba",
      mealType: "dinner",
      minutes: 10,
      servings: 1,
      instructions: "1. Cocinar",
      tags: "",
      items: [{ ingredientId: pasta.id, quantity: 0.2, unit: "kg" }],
    });
    const [stored] = await m.db.select().from(m.s.recipeIngredients).where(m.eq(m.s.recipeIngredients.recipeId, created.id));
    expect(stored.quantity).toBe(200); // 0,2 kg normalizado a gramos

    const r = await m.plans.generateWeekPlan({ weekStart: "2030-09-02", days: 1, budgetCents: 4300, skips: [], seed: 1 });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    const target = entries.find((e) => e.status === "planned")!;
    await m.actions.swapEntryAction({ entryId: target.id, recipeId: created.id });
    const before = (await items(r.listId)).find((x) => x.ingredientId === pasta.id)!;
    expect(before.neededQty).toBeGreaterThanOrEqual(200);

    await rec.saveRecipeAction({
      id: created.id,
      name: "Receta de prueba",
      mealType: "dinner",
      minutes: 10,
      servings: 1,
      instructions: "1. Cocinar",
      tags: "",
      items: [
        { ingredientId: pasta.id, quantity: 400, unit: "g" },
        { ingredientId: huevos.id, quantity: 2, unit: "unit" },
      ],
    });
    const after = await items(r.listId);
    expect(after.find((x) => x.ingredientId === pasta.id)!.neededQty).toBeGreaterThan(before.neededQty);
    expect(after.some((x) => x.ingredientId === huevos.id)).toBe(true);
    const ids = after.map((x) => x.ingredientId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rechaza recetas con ingredientes repetidos o sin ingredientes y duplica y elimina bien", async () => {
    const rec = await import("./recipe-actions");
    const data = await (await import("./catalog")).loadCatalog();
    const pasta = [...data.ingredients.values()].find((i) => i.name === "Pasta seca")!;
    const base = { name: "X", mealType: "dinner" as const, minutes: 5, servings: 1, instructions: "", tags: "" };
    await expect(
      rec.saveRecipeAction({ ...base, items: [{ ingredientId: pasta.id, quantity: 1, unit: "g" }, { ingredientId: pasta.id, quantity: 2, unit: "g" }] }),
    ).rejects.toThrow();
    await expect(rec.saveRecipeAction({ ...base, items: [] })).rejects.toThrow();
    await expect(rec.saveRecipeAction({ ...base, items: [{ ingredientId: pasta.id, quantity: 1, unit: "tazas" }] })).rejects.toThrow();

    const ok = await rec.saveRecipeAction({ ...base, items: [{ ingredientId: pasta.id, quantity: 100, unit: "g" }] });
    const copy = await rec.duplicateRecipeAction(ok.id);
    expect(copy.id).not.toBe(ok.id);
    const copied = await m.db.select().from(m.s.recipeIngredients).where(m.eq(m.s.recipeIngredients.recipeId, copy.id));
    expect(copied).toHaveLength(1);
    await rec.deleteRecipeAction(copy.id);
    expect(await m.db.select().from(m.s.recipes).where(m.eq(m.s.recipes.id, copy.id))).toHaveLength(0);
  });

  it("crear un ingrediente nuevo valida duplicados y marca la nutricion como estimada salvo etiqueta", async () => {
    const rec = await import("./recipe-actions");
    const res = await rec.createIngredientAction({
      name: "Lentejas test",
      category: "conservas_secos",
      baseUnit: "g",
      nutrition: { kcal: 350, protein: 25, carbs: 60, fat: 1, fromLabel: false },
    });
    const [row] = await m.db.select().from(m.s.ingredients).where(m.eq(m.s.ingredients.id, res.id));
    expect(row.nutritionIsEstimate).toBe(true);
    await expect(
      rec.createIngredientAction({ name: "lentejas TEST", category: "otros", baseUnit: "g" }),
    ).rejects.toThrow();
  });

  it("la importacion CSV agrega productos y precios y reporta filas con error", async () => {
    const csv = [
      "tienda,ingrediente,producto,marca,tamano,unidad,precio,promo,vigente_hasta,fecha,fuente,al_peso",
      "iper,Arroz,Arroz test 1kg,Marca,1000,g,1.45,,,2026-10-20,Prueba,no",
      "iper,Nada,X,,1,g,1,,,,,no",
    ].join("\n");
    const res = await m.actions.importPricesCsvAction(csv);
    expect(res.imported).toBe(1);
    expect(res.errors).toHaveLength(1);
    const iper = (await m.db.select().from(m.s.stores)).find((x) => x.slug === "iper")!;
    const prods = await m.db.select().from(m.s.products).where(m.eq(m.s.products.storeId, iper.id));
    expect(prods.some((p) => p.name === "Arroz test 1kg")).toBe(true);
  });
});
