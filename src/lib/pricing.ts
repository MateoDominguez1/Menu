import type { PriceLite, ProductLite } from "./types";

export const STALE_AFTER_DAYS = 21;

export type PriceFreshness = "fresh" | "stale" | "expired";

export type ResolvedPrice = {
  record: PriceLite;
  cents: number;
  isPromo: boolean;
  freshness: PriceFreshness;
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10));
  const b = Date.parse(toIso.slice(0, 10));
  return Math.round((b - a) / 86_400_000);
}

function validityPassed(record: PriceLite, today: string): boolean {
  return !!record.validUntil && record.validUntil.slice(0, 10) < today;
}

/**
 * Si el registro tiene promo, `validUntil` vale para la promo y el precio habitual sigue siendo usable.
 * Si no tiene promo, `validUntil` vale para el precio entero (p. ej. un precio de volantino).
 */
export function priceFreshness(record: PriceLite, today: string): PriceFreshness {
  if (record.promoPriceCents === null && validityPassed(record, today)) return "expired";
  if (daysBetween(record.observedAt, today) > STALE_AFTER_DAYS) return "stale";
  return "fresh";
}

export function resolvePrice(record: PriceLite, today: string): ResolvedPrice {
  const freshness = priceFreshness(record, today);
  const promoActive =
    record.promoPriceCents !== null && !validityPassed(record, today);
  return {
    record,
    cents: promoActive ? (record.promoPriceCents as number) : record.priceCents,
    isPromo: promoActive,
    freshness,
  };
}

/** Elige el mejor precio utilizable: nunca uno vencido; prefiere confirmado y mas reciente. */
export function pickBestPrice(
  records: PriceLite[],
  today: string,
): ResolvedPrice | null {
  const usable = records
    .map((r) => resolvePrice(r, today))
    .filter((r) => r.freshness !== "expired");
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    if (a.record.confirmedByUser !== b.record.confirmedByUser) {
      return a.record.confirmedByUser ? -1 : 1;
    }
    return b.record.observedAt.localeCompare(a.record.observedAt);
  });
  return usable[0];
}

/** Precio normalizado por kg, litro o unidad, segun la unidad del envase. */
export function normalizedUnitPrice(
  product: ProductLite,
  cents: number,
): { cents: number; label: "kg" | "L" | "u" } {
  if (product.packUnit === "unit") {
    return { cents: cents / product.packSize, label: "u" };
  }
  const per1000 = (cents / product.packSize) * 1000;
  return { cents: per1000, label: product.packUnit === "g" ? "kg" : "L" };
}

export function packsNeeded(product: ProductLite, neededQty: number): number {
  if (neededQty <= 0) return 0;
  if (product.soldByWeight) return neededQty / product.packSize;
  return Math.max(1, Math.ceil(neededQty / product.packSize - 1e-9));
}

export type PricedOption = {
  product: ProductLite;
  resolved: ResolvedPrice;
  packs: number;
  totalCents: number;
  leftoverQty: number;
  unitPrice: { cents: number; label: "kg" | "L" | "u" };
};

export function priceOption(
  product: ProductLite,
  records: PriceLite[],
  neededQty: number,
  today: string,
): PricedOption | null {
  const resolved = pickBestPrice(records, today);
  if (!resolved) return null;
  const packs = packsNeeded(product, neededQty);
  return {
    product,
    resolved,
    packs,
    totalCents: Math.round(packs * resolved.cents),
    leftoverQty: Math.max(0, packs * product.packSize - neededQty),
    unitPrice: normalizedUnitPrice(product, resolved.cents),
  };
}

export type BasketItem = {
  key: string;
  ingredientId: number | null;
  name: string;
  toBuyQty: number;
};

export type Catalog = {
  productsByIngredient: Map<number, ProductLite[]>;
  pricesByProduct: Map<number, PriceLite[]>;
};

export type StoreRef = { id: number; slug: string; name: string };

export type BasketLine = {
  item: BasketItem;
  byStore: Map<number, PricedOption | null>;
  cheapestStoreId: number | null;
};

export type StrategyResult = {
  strategy: string;
  storeIds: number[];
  totalCents: number;
  pricedCount: number;
  imputedCount: number;
  overheadCents: number;
  adjustedCents: number;
};

export type Comparison = {
  lines: BasketLine[];
  unknownEverywhere: BasketItem[];
  strategies: StrategyResult[];
  recommended: StrategyResult | null;
  splitSavingsCents: number;
};

export function bestOptionInStore(
  item: BasketItem,
  storeId: number,
  catalog: Catalog,
  today: string,
): PricedOption | null {
  if (item.ingredientId === null || item.toBuyQty <= 0) return null;
  const products = (catalog.productsByIngredient.get(item.ingredientId) ?? []).filter(
    (p) => p.storeId === storeId,
  );
  let best: PricedOption | null = null;
  for (const p of products) {
    const opt = priceOption(p, catalog.pricesByProduct.get(p.id) ?? [], item.toBuyQty, today);
    if (opt && (!best || opt.totalCents < best.totalCents)) best = opt;
  }
  return best;
}

export function compareBaskets(
  items: BasketItem[],
  stores: StoreRef[],
  catalog: Catalog,
  today: string,
  opts: { travelCostCents: number; timePenaltyCents: number },
): Comparison {
  const lines: BasketLine[] = items.map((item) => {
    const byStore = new Map<number, PricedOption | null>();
    let cheapest: number | null = null;
    let cheapestCents = Infinity;
    for (const s of stores) {
      const opt = bestOptionInStore(item, s.id, catalog, today);
      byStore.set(s.id, opt);
      if (opt && opt.totalCents < cheapestCents) {
        cheapestCents = opt.totalCents;
        cheapest = s.id;
      }
    }
    return { item, byStore, cheapestStoreId: cheapest };
  });

  const unknownEverywhere = lines
    .filter((l) => l.cheapestStoreId === null && l.item.toBuyQty > 0)
    .map((l) => l.item);
  const comparable = lines.filter((l) => l.cheapestStoreId !== null);

  const overhead = opts.travelCostCents + opts.timePenaltyCents;
  const strategies: StrategyResult[] = [];

  for (const s of stores) {
    let total = 0;
    let imputed = 0;
    for (const l of comparable) {
      const own = l.byStore.get(s.id) ?? null;
      if (own) total += own.totalCents;
      else {
        const other = l.byStore.get(l.cheapestStoreId as number);
        total += other ? other.totalCents : 0;
        imputed += 1;
      }
    }
    strategies.push({
      strategy: `all:${s.slug}`,
      storeIds: [s.id],
      totalCents: total,
      pricedCount: comparable.length - imputed,
      imputedCount: imputed,
      overheadCents: 0,
      adjustedCents: total,
    });
  }

  const usedStores = new Set<number>();
  let splitTotal = 0;
  for (const l of comparable) {
    usedStores.add(l.cheapestStoreId as number);
    splitTotal += (l.byStore.get(l.cheapestStoreId as number) as PricedOption).totalCents;
  }
  const splitOverhead = usedStores.size > 1 ? overhead * (usedStores.size - 1) : 0;
  strategies.push({
    strategy: "split",
    storeIds: [...usedStores],
    totalCents: splitTotal,
    pricedCount: comparable.length,
    imputedCount: 0,
    overheadCents: splitOverhead,
    adjustedCents: splitTotal + splitOverhead,
  });

  const singles = strategies.filter((s) => s.strategy.startsWith("all:"));
  const bestSingle = singles.reduce<StrategyResult | null>((best, s) => {
    if (!best) return s;
    if (s.adjustedCents !== best.adjustedCents) {
      return s.adjustedCents < best.adjustedCents ? s : best;
    }
    return s.imputedCount < best.imputedCount ? s : best;
  }, null);
  const split = strategies.find((s) => s.strategy === "split") as StrategyResult;

  let recommended: StrategyResult | null = bestSingle;
  if (bestSingle && split.storeIds.length > 1 && split.adjustedCents < bestSingle.adjustedCents) {
    recommended = split;
  }
  if (comparable.length === 0) recommended = null;

  return {
    lines,
    unknownEverywhere,
    strategies,
    recommended,
    splitSavingsCents: bestSingle ? bestSingle.totalCents - split.totalCents : 0,
  };
}
