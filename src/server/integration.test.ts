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

  it("los datos de referencia de Iper se agregan a una base vieja una sola vez y sin pisar nada", async () => {
    const { applyReferenceData } = await import("@/db/seed");
    const iper = (await m.db.select().from(m.s.stores)).find((x) => x.slug === "iper")!;
    expect(iper.name).toBe("Iper La grande i");
    // Simula una base anterior: tienda con el nombre viejo y sin productos de Iper.
    const old = await m.db.select().from(m.s.products).where(m.eq(m.s.products.storeId, iper.id));
    for (const p of old) await m.db.delete(m.s.products).where(m.eq(m.s.products.id, p.id));
    await m.db.update(m.s.stores).set({ name: "Iper" }).where(m.eq(m.s.stores.id, iper.id));

    const first = await applyReferenceData(m.db);
    expect(first.added).toBeGreaterThanOrEqual(3);
    expect((await m.db.select().from(m.s.stores).where(m.eq(m.s.stores.id, iper.id)))[0].name).toBe("Iper La grande i");
    const second = await applyReferenceData(m.db);
    expect(second.added).toBe(0);
    const prods = await m.db.select().from(m.s.products).where(m.eq(m.s.products.storeId, iper.id));
    const prices = await m.db.select().from(m.s.priceRecords);
    const mine = prices.filter((p) => prods.some((x) => x.id === p.productId));
    expect(mine.every((p) => p.validUntil === "2026-10-25" && !!p.sourceRef)).toBe(true);
  });

  it("corrige los precios de Iper cargados antes de leer el PDF oficial, sin tocar los confirmados por el usuario", async () => {
    const { applyReferenceData } = await import("@/db/seed");
    const iper = (await m.db.select().from(m.s.stores)).find((x) => x.slug === "iper")!;
    const [patate] = await m.db
      .select()
      .from(m.s.products)
      .where(m.eq(m.s.products.name, "Patate a pasta gialla 2,5 kg"));
    expect(patate.storeId).toBe(iper.id);
    await m.db.delete(m.s.priceRecords).where(m.eq(m.s.priceRecords.productId, patate.id));
    const base = { productId: patate.id, sourceKind: "flyer" as const, observedAt: "2026-10-20" };
    await m.db.insert(m.s.priceRecords).values({ ...base, priceCents: 100, sourceRef: "tercero" });
    await m.db.insert(m.s.priceRecords).values({ ...base, priceCents: 100, sourceRef: "mio", confirmedByUser: true });
    await applyReferenceData(m.db);
    const recs = await m.db.select().from(m.s.priceRecords).where(m.eq(m.s.priceRecords.productId, patate.id));
    expect(recs.find((r) => r.sourceRef?.includes("PDF oficial"))?.priceCents).toBe(245);
    expect(recs.find((r) => r.sourceRef === "mio")?.priceCents).toBe(100);
  });

  it("agregar un producto de Iper con precio confirmado normaliza el tamano y alimenta la comparacion", async () => {
    const data = await (await import("./catalog")).loadCatalog();
    const iper = data.stores.find((x) => x.slug === "iper")!;
    const arroz = [...data.ingredients.values()].find((i) => i.name === "Arroz")!;
    const res = await m.actions.addProductAction({
      storeId: iper.id,
      ingredientId: arroz.id,
      name: "Riso test 1 kg",
      brand: "Marca",
      packSize: 1,
      packUnit: "kg",
      soldByWeight: false,
      priceCents: 99,
    });
    const [p] = await m.db.select().from(m.s.products).where(m.eq(m.s.products.id, res.productId));
    expect(p.packSize).toBe(1000);
    expect(p.packUnit).toBe("g");
    const recs = await m.db.select().from(m.s.priceRecords).where(m.eq(m.s.priceRecords.productId, p.id));
    expect(recs[0].confirmedByUser).toBe(true);
    // Repetir el mismo producto reutiliza el registro y suma un precio nuevo.
    const again = await m.actions.addProductAction({
      storeId: iper.id, ingredientId: arroz.id, name: "Riso test 1 kg", packSize: 1, packUnit: "kg", priceCents: 95,
    });
    expect(again.productId).toBe(res.productId);
    await expect(
      m.actions.addProductAction({ storeId: iper.id, ingredientId: arroz.id, name: "x", packSize: 0, packUnit: "g", priceCents: 1 }),
    ).rejects.toThrow();
    await expect(
      m.actions.addProductAction({ storeId: iper.id, ingredientId: arroz.id, name: "x", packSize: 1, packUnit: "ml", priceCents: 1 }),
    ).rejects.toThrow();
  });

  it("el plan se compone con lo que esta en oferta y cambia de una semana a otra", async () => {
    const { importOffers, relinkOffers } = await import("./offers");
    const o = (name: string, priceCents: number, extra: Partial<import("@/lib/flyer/types").ParsedOffer> = {}) => ({
      store: "iper" as const,
      page: 4,
      name,
      brand: null,
      priceCents,
      regularCents: null,
      discountPct: null,
      unitPriceCents: null,
      unitPriceLabel: null,
      perKg: true,
      needsCard: false,
      condition: null,
      packSize: null,
      packUnit: null,
      category: "carne" as const,
      ...extra,
    });
    const res = await importOffers({
      storeSlug: "iper",
      label: "Volantino de prueba",
      validFrom: "2026-01-01",
      validUntil: "2099-12-31",
      offers: [
        o("Sovracosce di pollo maxi", 489, { regularCents: 689, discountPct: 29 }),
        o("Orata già pulita", 980),
        o("Salsiccia di suino", 759),
        o("Finocchi", 138, { category: "fruta_verdura" }),
        o("Cavolfiore", 149, { category: "fruta_verdura" }),
        o("Lenticchie lessate 400 g", 129, { perKg: false, packSize: 400, packUnit: "g", category: "conservas_despensa" }),
        o("Latte UHT 1 l", 99, { perKg: false, packSize: 1000, packUnit: "ml", category: "lacteos_huevos" }),
        o("Mazzancolle tropicali cotte 668 g", 1699, { perKg: false, packSize: 668, packUnit: "g", category: "pescado" }),
      ],
    });
    expect(res.imported).toBe(8);
    expect(res.linkedToIngredients).toBeGreaterThanOrEqual(6);
    expect((await relinkOffers()).linked).toBe(0); // idempotente

    const first = await m.plans.generateWeekPlan({ weekStart: "2031-01-06", days: 7, budgetCents: 4300, skips: [], seed: 11 });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, first.planId));
    const recipeRows = await m.db.select().from(m.s.recipes);
    const byId = new Map(recipeRows.map((r) => [r.id, r]));
    const generated = entries.filter((e) => e.recipeId && byId.get(e.recipeId)?.source === "generated");
    expect(generated.length).toBeGreaterThan(3);

    // Lo generado usa ingredientes en oferta y su costo sale del precio del volantino.
    const ings = await m.db.select().from(m.s.ingredients);
    const nameOf = new Map(ings.map((i) => [i.id, i.name]));
    const used = new Set<string>();
    for (const e of generated) {
      const ri = await m.db.select().from(m.s.recipeIngredients).where(m.eq(m.s.recipeIngredients.recipeId, e.recipeId!));
      ri.forEach((x) => used.add(nameOf.get(x.ingredientId)!));
    }
    expect(["Pollo muslo", "Dorada", "Salchicha fresca", "Hinojo", "Coliflor", "Lentejas"].some((n) => used.has(n))).toBe(true);
    const list = await items(first.listId);
    expect(list.some((x) => x.estPriceCents !== null && x.priceStatus === "estimated")).toBe(true);
    // Un envase carisimo para una persona no se usa, y todo lo compuesto se puede costear.
    expect(used.has("Gambas")).toBe(false);
    const generatedIngredients = list.filter((x) => x.ingredientId !== null && x.toBuyQty > 0 && used.has(nameOf.get(x.ingredientId)!));
    expect(generatedIngredients.filter((x) => x.priceStatus === "unknown")).toEqual([]);

    // La semana siguiente no repite las mismas comidas.
    const second = await m.plans.generateWeekPlan({ weekStart: "2031-01-13", days: 7, budgetCents: 4300, skips: [], seed: 12 });
    const next = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, second.planId));
    const a = new Set(entries.map((e) => e.recipeId));
    const repeated = next.filter((e) => e.recipeId && a.has(e.recipeId)).length;
    expect(repeated).toBeLessThan(next.length / 2);
  });

  it("lo marcado como siempre en casa se avisa en la lista y se puede pasar a comprar", async () => {
    const r = await m.plans.generateWeekPlan({ weekStart: "2031-03-03", days: 3, budgetCents: 4300, skips: [], seed: 21 });
    const before = await items(r.listId);
    const target = before.find((x) => x.ingredientId !== null && x.toBuyQty > 0 && !x.removedAt)!;
    await m.db.insert(m.s.profileRules).values({ kind: "staple", value: target.name });
    await m.sync.syncShoppingList(r.planId);

    const view = await m.q.getListView(r.planId);
    expect(view.items.find((x) => x.ingredientId === target.ingredientId && !x.removed && x.toBuyQty > 0)).toBeUndefined();
    expect(view.stapleNeeds.map((n) => n.ingredientId)).toContain(target.ingredientId);

    await m.actions.unmarkStapleAction({ ingredientId: target.ingredientId!, listId: r.listId });
    const after = await m.q.getListView(r.planId);
    expect(after.items.some((x) => x.ingredientId === target.ingredientId && !x.removed && x.toBuyQty > 0)).toBe(true);
    expect(after.stapleNeeds.map((n) => n.ingredientId)).not.toContain(target.ingredientId);
  });

  it("se puede buscar una comida por nombre y poner una propia en el plan", async () => {
    const found = await m.actions.searchRecipesAction("sandwich jamón queso");
    expect(found.map((x) => x.name)).toContain("Sandwich de jamon y queso");
    expect(await m.actions.searchRecipesAction("x")).toEqual([]);

    const r = await m.plans.generateWeekPlan({ weekStart: "2031-04-07", days: 2, budgetCents: 4300, skips: [], seed: 3 });
    const entries = await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.planId, r.planId));
    const target = entries.find((e) => e.status === "planned")!;
    const catalog = await (await import("./catalog")).loadCatalog();
    const pan = [...catalog.ingredients.values()].find((i) => i.name === "Pan de molde")!;
    const own = await (await import("./recipe-actions")).saveRecipeAction({
      name: "Tostado casero",
      mealType: target.slot,
      minutes: 7,
      servings: 1,
      instructions: "Tostar el pan\nAgregar el queso",
      tags: "",
      items: [{ ingredientId: pan.id, quantity: 80, unit: "g" }],
    });
    await m.actions.swapEntryAction({ entryId: target.id, recipeId: own.id });
    const after = (await m.db.select().from(m.s.mealPlanEntries).where(m.eq(m.s.mealPlanEntries.id, target.id)))[0];
    expect(after.recipeId).toBe(own.id);
    expect((await m.actions.searchRecipesAction("tostado casero")).map((x) => x.id)).toContain(own.id);
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
