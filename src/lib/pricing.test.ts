import { describe, expect, it } from "vitest";
import {
  compareBaskets,
  normalizedUnitPrice,
  packsNeeded,
  pickBestPrice,
  priceFreshness,
  type Catalog,
} from "./pricing";
import { price, product } from "./fixtures";

const TODAY = "2026-10-20";
const stores = [
  { id: 1, slug: "esselunga", name: "Esselunga" },
  { id: 2, slug: "iper", name: "Iper" },
];
const opts = { travelCostCents: 300, timePenaltyCents: 200 };

function catalog(entries: { p: ReturnType<typeof product>; prices: ReturnType<typeof price>[] }[]): Catalog {
  const productsByIngredient = new Map<number, ReturnType<typeof product>[]>();
  const pricesByProduct = new Map<number, ReturnType<typeof price>[]>();
  for (const e of entries) {
    productsByIngredient.set(e.p.ingredientId, [
      ...(productsByIngredient.get(e.p.ingredientId) ?? []),
      e.p,
    ]);
    pricesByProduct.set(e.p.id, e.prices);
  }
  return { productsByIngredient, pricesByProduct };
}

describe("precio normalizado", () => {
  it("compara por kg aunque el envase tenga distinto tamano", () => {
    const small = normalizedUnitPrice(product(1, 1, 1, 400), 519);
    const big = normalizedUnitPrice(product(2, 2, 1, 1000), 1100);
    expect(Math.round(small.cents)).toBe(1298);
    expect(Math.round(big.cents)).toBe(1100);
    expect(small.label).toBe("kg");
  });

  it("calcula cuantos envases hacen falta", () => {
    expect(packsNeeded(product(1, 1, 1, 500), 650)).toBe(2);
    expect(packsNeeded(product(1, 1, 1, 500), 500)).toBe(1);
    expect(packsNeeded(product(1, 1, 1, 500), 0)).toBe(0);
  });
});

describe("vigencia del precio", () => {
  it("marca como vencido un precio con validUntil pasado", () => {
    expect(priceFreshness(price(1, 100, { validUntil: "2026-10-10" }), TODAY)).toBe("expired");
  });

  it("marca como desactualizado un precio viejo", () => {
    expect(priceFreshness(price(1, 100, { observedAt: "2026-08-01" }), TODAY)).toBe("stale");
  });

  it("nunca elige un precio vencido", () => {
    const best = pickBestPrice([price(1, 100, { validUntil: "2026-10-10" })], TODAY);
    expect(best).toBeNull();
  });

  it("si la promo vencio, conserva el precio habitual", () => {
    const best = pickBestPrice(
      [price(1, 699, { promoPriceCents: 519, validUntil: "2026-10-07" })],
      TODAY,
    );
    expect(best?.cents).toBe(699);
    expect(best?.isPromo).toBe(false);
  });

  it("cobra solo lo que se pesa en productos a granel", () => {
    const loose = product(1, 1, 1, 1000, "g", true);
    expect(packsNeeded(loose, 600)).toBeCloseTo(0.6);
  });

  it("prefiere el precio confirmado por el usuario", () => {
    const best = pickBestPrice(
      [price(1, 100), price(1, 130, { confirmedByUser: true, observedAt: "2026-10-01" })],
      TODAY,
    );
    expect(best?.cents).toBe(130);
  });

  it("usa la promo solo mientras esta vigente", () => {
    const best = pickBestPrice(
      [price(1, 200, { promoPriceCents: 150, validUntil: "2026-10-25" })],
      TODAY,
    );
    expect(best?.cents).toBe(150);
    expect(best?.isPromo).toBe(true);
  });
});

describe("compareBaskets", () => {
  const items = [
    { key: "a", ingredientId: 1, name: "Pollo", toBuyQty: 600 },
    { key: "b", ingredientId: 2, name: "Pasta", toBuyQty: 500 },
    { key: "c", ingredientId: 3, name: "Sin precio", toBuyQty: 100 },
  ];

  it("no recomienda dos tiendas por un ahorro menor al costo de desplazamiento", () => {
    const cat = catalog([
      { p: product(1, 1, 1, 600), prices: [price(1, 500)] },
      { p: product(2, 2, 1, 600), prices: [price(2, 520)] },
      { p: product(3, 1, 2, 500), prices: [price(3, 100)] },
      { p: product(4, 2, 2, 500), prices: [price(4, 50)] },
    ]);
    const cmp = compareBaskets(items, stores, cat, TODAY, opts);
    expect(cmp.splitSavingsCents).toBe(20);
    expect(cmp.recommended?.strategy).toBe("all:iper");
  });

  it("recomienda dividir cuando el ahorro supera el desplazamiento", () => {
    const cat = catalog([
      { p: product(1, 1, 1, 600), prices: [price(1, 2000)] },
      { p: product(2, 2, 1, 600), prices: [price(2, 400)] },
      { p: product(3, 1, 2, 500), prices: [price(3, 100)] },
      { p: product(4, 2, 2, 500), prices: [price(4, 1500)] },
    ]);
    const cmp = compareBaskets(items, stores, cat, TODAY, opts);
    expect(cmp.recommended?.strategy).toBe("split");
    expect(cmp.recommended?.totalCents).toBe(500);
    expect(cmp.recommended?.adjustedCents).toBe(1000);
  });

  it("lista los productos sin precio en ninguna tienda y no los suma", () => {
    const cat = catalog([{ p: product(1, 1, 1, 600), prices: [price(1, 500)] }]);
    const cmp = compareBaskets(items, stores, cat, TODAY, opts);
    expect(cmp.unknownEverywhere.map((i) => i.key)).toEqual(["b", "c"]);
  });

  it("no recomienda una tienda sin datos propios", () => {
    const cat = catalog([{ p: product(1, 1, 1, 600), prices: [price(1, 500)] }]);
    const reversed = [stores[1], stores[0]];
    const cmp = compareBaskets(items, reversed, cat, TODAY, opts);
    expect(cmp.recommended?.strategy).toBe("all:esselunga");
  });

  it("sigue funcionando sin ningun precio", () => {
    const cmp = compareBaskets(items, stores, catalog([]), TODAY, opts);
    expect(cmp.recommended).toBeNull();
    expect(cmp.unknownEverywhere).toHaveLength(3);
  });

  it("ignora precios vencidos en la comparacion", () => {
    const cat = catalog([
      { p: product(1, 1, 1, 600), prices: [price(1, 500)] },
      { p: product(2, 2, 1, 600), prices: [price(2, 100, { validUntil: "2026-10-10" })] },
    ]);
    const cmp = compareBaskets([items[0]], stores, cat, TODAY, opts);
    expect(cmp.lines[0].cheapestStoreId).toBe(1);
  });
});
