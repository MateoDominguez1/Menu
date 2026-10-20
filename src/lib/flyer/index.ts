import { isEsselungaFoodPage, parseEsselungaPage } from "./parse-esselunga";
import { parseIperPage } from "./parse-iper";
import { extractPageItems, type PdfDocLike } from "./pdf-items";
import type { OfferStoreSlug, PageItems, ParsedOffer } from "./types";

const MONTHS: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Busca "dal 12 al 25 ottobre", "8 - 21 ottobre", "dall'8 al 21 ottobre 2026". */
export function detectValidity(text: string, today: string): { from: string | null; until: string | null } {
  const clean = text.replace(/[’']/g, " ").replace(/\s+/g, " ");
  const m = clean.match(
    /(?:dal(?:l)?\s+)?(\d{1,2})\s*(?:(?:al|-|–)\s*)(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(20\d{2}))?/i,
  );
  if (!m) return { from: null, until: null };
  const year = m[4] ? parseInt(m[4], 10) : parseInt(today.slice(0, 4), 10);
  const month = MONTHS[m[3].toLowerCase()];
  return {
    from: `${year}-${pad(month)}-${pad(parseInt(m[1], 10))}`,
    until: `${year}-${pad(month)}-${pad(parseInt(m[2], 10))}`,
  };
}

export function detectStore(text: string): OfferStoreSlug | null {
  const es = (text.match(/F[IÌ]DATY|PUNTI FRAGOLA|ESSELUNGA/gi) ?? []).length;
  const ip = (text.match(/CARTA\s+VANTAGGI|IPER\s+PREZZO|LA GRANDE I|\bIPER\b/gi) ?? []).length;
  if (es === 0 && ip === 0) return null;
  return es > ip ? "esselunga" : "iper";
}

const IPER_FOOD = /FRESCHI|PRONTI|DISPENSA|T[ÈE] E TISANE|CAFF[ÈE]|PASTA|CANTINA|SAPORI|SURGEL|BEVANDE|COLAZIONE|DOLCI|SNACK|OFFERTE/i;
const IPER_SKIP = /PULITO|BELLEZZA|ANIMALI|UTILI|CASA E TEMPO|MODA|RELAX|ELETTRO|GIARDINO|AUTO/i;

export function isIperFoodPage(heading: string): boolean {
  if (!heading.trim()) return false;
  if (IPER_SKIP.test(heading)) return false;
  return IPER_FOOD.test(heading);
}

export type FlyerResult = {
  store: OfferStoreSlug | null;
  validFrom: string | null;
  validUntil: string | null;
  offers: ParsedOffer[];
  pages: { page: number; heading: string; parsed: number; skipped: boolean }[];
  warnings: string[];
};

function headingOf(page: PageItems): string {
  return (
    page.items
      .filter((i) => i.size >= 17 && i.y < 120 && !/^[\d€,.%\s]+$/.test(i.str))
      .sort((a, b) => a.y - b.y || a.x - b.x)[0]
      ?.str.trim() ?? ""
  );
}

export async function parseFlyerDocument(
  doc: PdfDocLike,
  opts: { today: string; storeHint?: OfferStoreSlug; onProgress?: (done: number, total: number) => void },
): Promise<FlyerResult> {
  const pages: PageItems[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    pages.push(await extractPageItems(doc, p));
    opts.onProgress?.(p, doc.numPages * 2);
  }
  const sample = pages
    .slice(0, 6)
    .flatMap((p) => p.items.map((i) => i.str))
    .join(" ");
  const store = opts.storeHint ?? detectStore(sample);
  const warnings: string[] = [];
  if (!store) warnings.push("No se pudo identificar la tienda: elige Iper o Esselunga.");
  const validity = detectValidity(pages.slice(0, 3).flatMap((p) => p.items.map((i) => i.str)).join(" "), opts.today);
  if (!validity.until) warnings.push("No se encontraron las fechas de validez en el PDF: completalas a mano.");

  const offers: ParsedOffer[] = [];
  const stats: FlyerResult["pages"] = [];
  pages.forEach((page, idx) => {
    const heading = headingOf(page);
    const text = page.items.map((i) => i.str).join(" ");
    let parsed: ParsedOffer[] = [];
    let skipped = false;
    if (store === "iper") {
      if (isIperFoodPage(heading) && page.page > 1) parsed = parseIperPage(page, heading);
      else skipped = true;
    } else if (store === "esselunga") {
      if (isEsselungaFoodPage(heading, text)) parsed = parseEsselungaPage(page);
      else skipped = true;
    } else skipped = true;
    offers.push(...parsed);
    stats.push({ page: page.page, heading, parsed: parsed.length, skipped });
    opts.onProgress?.(pages.length + idx + 1, pages.length * 2);
  });
  const skippedPages = stats.filter((s) => s.skipped).map((s) => s.page);
  if (skippedPages.length > 0) {
    warnings.push(`Paginas omitidas por no ser de alimentos o no tener precios legibles: ${skippedPages.join(", ")}.`);
  }
  warnings.push(
    "Los banners con imagen no tienen texto en el PDF y no se pueden leer: algunos productos destacados pueden faltar.",
  );
  return { store, validFrom: validity.from, validUntil: validity.until, offers, pages: stats, warnings };
}
