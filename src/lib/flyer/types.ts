import { OFFER_CATEGORIES, type BaseUnit } from "@/db/schema";

export { OFFER_CATEGORIES };
export type OfferCategory = (typeof OFFER_CATEGORIES)[number];

/** Fragmento de texto de una pagina, en puntos PDF con el origen arriba a la izquierda. */
export type TextItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tamano de fuente aproximado (alto del glifo). */
  size: number;
};

export type PageItems = {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
};

export type OfferStoreSlug = "iper" | "esselunga";

/** Una oferta leida del volantino, antes de revisarla o importarla. */
export type ParsedOffer = {
  store: OfferStoreSlug;
  page: number;
  name: string;
  brand: string | null;
  /** Precio que se paga (promo si hay), en centimos. */
  priceCents: number;
  /** Precio habitual tachado, en centimos, si figura. */
  regularCents: number | null;
  discountPct: number | null;
  /** Precio por kg o litro impreso, en centimos, si figura. */
  unitPriceCents: number | null;
  unitPriceLabel: "kg" | "L" | null;
  /** El precio se aplica por kg (carne, fruta, fiambre al corte). */
  perKg: boolean;
  needsCard: boolean;
  condition: string | null;
  packSize: number | null;
  packUnit: BaseUnit | null;
  category: OfferCategory;
};
