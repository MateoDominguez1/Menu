import { categorize, hasVariants, looksNonFood, parseEuroCents, parsePack } from "./shared";
import type { PageItems, ParsedOffer, TextItem } from "./types";

type Amount = { cents: number; size: number; x: number; y: number; right: number; leftX: number };
type Block = { x: number; top: number; bottom: number; nameLines: string[]; descLines: string[] };

const FOOD_HEADINGS = /(FRESCHI|SURGELATI|ALIMENTARI|FORMAGGI|FRUTTA|PESCE|CARNE|GASTRONOMIA|PANE|ENOTECA|DOLCI)/i;
const SKIP_HEADINGS = /(CURA CASA|CURA PERSONA|CASA E ACCESSORI|AMICI ANIMALI|COLLEZIONE|HIT)/i;

export function isEsselungaFoodPage(heading: string, fullText: string): boolean {
  const h = `${heading} ${fullText.slice(0, 200)}`;
  if (SKIP_HEADINGS.test(h) && !/ALIMENTARI/i.test(h)) return false;
  return FOOD_HEADINGS.test(h);
}

function sentence(text: string): string {
  const t = text.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function collectAmounts(items: TextItem[]): Amount[] {
  const out: Amount[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const t = it.str.trim();
    const full = t.match(/^€?\s*(\d{1,3}),(\d{2})$/);
    if (full && it.size >= 11) {
      out.push({ cents: parseInt(full[1], 10) * 100 + parseInt(full[2], 10), size: it.size, x: it.x, y: it.y, right: it.x + it.w, leftX: it.x });
      continue;
    }
    const intPart = t.match(/^(\d{1,3}),$/);
    if (intPart && it.size >= 18) {
      const dec = items.find(
        (d) => d !== it && /^\d{2}$/.test(d.str.trim()) && d.x >= it.x + it.w - 4 && d.x - (it.x + it.w) < 8 && Math.abs(d.y - it.y) < 30 && d.size < it.size,
      );
      if (dec) {
        out.push({
          cents: parseInt(intPart[1], 10) * 100 + parseInt(dec.str.trim(), 10),
          size: it.size,
          x: it.x,
          y: it.y,
          right: dec.x + dec.w,
          leftX: it.x,
        });
      }
    }
  }
  return out;
}

function buildBlocks(page: PageItems): Block[] {
  const cand = page.items
    .filter((i) => i.size >= 7.8 && i.size <= 9.6 && i.y > 45 && i.y < page.height - 40)
    .filter((i) => !/^[\d\s€,.%()]+$/.test(i.str.trim()) && !/^\(/.test(i.str.trim()) && !/al\s*kg\)?$/i.test(i.str.trim()) === true);
  const lines = cand.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const blocks: Block[] = [];
  const used = new Set<TextItem>();
  const BADGE = /^(ITALIANO|FORMATO|SCORTA|PREZZI|CORTI|PREZZO|SPECIALE|SCONTO|F[IÌ]DATY|SEMPRE|NOVIT[ÀA]|100%|PUNTI|FRAGOLA|PEZZO|PEZZI|ANZICH[ÈE]|GRATIS)\b/i;
  for (const first of lines.filter((l) => l.size >= 8.8 && /[A-ZÀ-Ý]{2}/.test(l.str) && !BADGE.test(l.str.trim())).sort((a, b) => a.y - b.y)) {
    if (used.has(first)) continue;
    const block: Block = { x: first.x, top: first.y, bottom: first.y + first.h, nameLines: [first.str.trim()], descLines: [] };
    used.add(first);
    let last = first;
    for (const nxt of lines.filter((l) => Math.abs(l.x - first.x) < 4 && l.y > first.y).sort((a, b) => a.y - b.y)) {
      if (used.has(nxt) || nxt.y - last.y > 13.5) continue;
      if (nxt.size >= 8.8 && block.descLines.length === 0 && /[A-ZÀ-Ý]{2}/.test(nxt.str) && nxt.str.trim() === nxt.str.trim().toUpperCase()) {
        block.nameLines.push(nxt.str.trim());
      } else {
        block.descLines.push(nxt.str.trim());
      }
      used.add(nxt);
      last = nxt;
      block.bottom = nxt.y + nxt.h;
    }
    blocks.push(block);
  }
  return blocks;
}

export function parseEsselungaPage(page: PageItems): ParsedOffer[] {
  const amounts = collectAmounts(page.items);
  const anchors = amounts.filter((a) => a.size >= 20).sort((a, b) => a.y - b.y);
  const blocks = buildBlocks(page);
  const fidatyPage = page.items.some((i) => /F[IÌ]DATY/i.test(i.str) && /RISERVATI|POSSESSORI/i.test(i.str));
  const used = new Set<Block>();
  const offers: ParsedOffer[] = [];

  for (const a of anchors) {
    // El "€" suele ser un item aparte a la izquierda: su x alinea con el texto del producto.
    const euro = page.items.find((e) => /^€$/.test(e.str.trim()) && e.x <= a.x && a.x - e.x < 45 && Math.abs(e.y - a.y) < 45);
    const leftX = Math.min(euro?.x ?? a.x, a.x);

    // Celdas normales: el nombre y el precio comparten x. Celdas espejadas: la etiqueta de descuento
    // va a la izquierda y el precio queda hasta ~190 pt a la derecha del nombre.
    const score = (b: Block) => a.y - b.bottom + 4 * Math.abs(leftX - b.x);
    const block = blocks
      .filter((b) => {
        if (used.has(b) || b.bottom > a.y + 8 || a.y - b.bottom > 620) return false;
        const dx = leftX - b.x;
        return dx >= -14 && dx <= 190;
      })
      .sort((x, y) => score(x) - score(y))[0];
    if (!block) continue;
    used.add(block);
    const cellX0 = Math.min(block.x, leftX) - 14;
    const cellX1 = Math.max(block.x, leftX) + 200;

    const name = sentence(block.nameLines.join(" "));
    const desc = block.descLines.join(" ").replace(/\s+/g, " ").trim();
    if (!name || looksNonFood(`${name} ${desc}`)) continue;

    const inCell = (i: TextItem) => i.x >= cellX0 && i.x <= cellX1 && i.y >= block.top - 2 && i.y <= a.y + 90;
    const cellItems = page.items.filter(inCell);

    const old = amounts
      .filter(
        (o) =>
          o !== a &&
          o.size >= 11 &&
          o.size < 20 &&
          o.y < a.y + 4 &&
          a.y - o.y < 160 &&
          o.y > block.bottom - 4 &&
          (Math.abs(o.leftX - leftX) < 18 || Math.abs(o.leftX - block.x) < 22),
      )
      .sort((x, y) => y.y - x.y)[0];

    const joinedSmall = cellItems
      .filter((i) => i.size <= 8.6 && i.y > a.y - 2 && i.y < a.y + 90)
      .sort((p, q) => p.y - q.y || p.x - q.x)
      .map((i) => i.str.trim())
      .join(" ");
    const unitMatch = joinedSmall.match(/\(\s*€\s*(\d+,\d{2})\s*al\s*(kg|l)\s*\)/i);
    const perKg = cellItems.some(
      (i) => i.size <= 8.6 && /^al\s*kg$/i.test(i.str.trim()) && i.y >= a.y - 45 && i.y <= a.y + 45 && Math.abs(i.x - leftX) < 18,
    ) && !unitMatch;

    const pctItem = cellItems.find((i) => i.size >= 10 && /^\d{2}%$/.test(i.str.trim()) && Math.abs(i.y - a.y) < 70 && i.y > block.bottom - 6);
    const discountPct = pctItem ? parseInt(pctItem.str.trim(), 10) : null;

    const fullName = `${name} ${desc}`.replace(/\s+/g, " ").replace(/[,\s]+$/, "").trim();
    const unitCents = unitMatch ? parseEuroCents(`€ ${unitMatch[1]}`) : perKg ? a.cents : null;
    const unitLabel: "kg" | "L" | null = unitMatch ? (unitMatch[2].toLowerCase() === "l" ? "L" : "kg") : perKg ? "kg" : null;

    let pack = perKg ? null : parsePack(fullName);
    if (!perKg && unitCents && unitLabel && !pack) {
      pack = { size: Math.round((a.cents / unitCents) * 1000), unit: unitLabel === "kg" ? "g" : "ml", multi: false };
    }
    if (!perKg && unitCents && pack && pack.unit !== "unit") {
      const implied = (a.cents / unitCents) * 1000;
      if (implied / pack.size < 0.8 || implied / pack.size > 1.25) pack = null;
    }

    const conditions: string[] = [];
    const needsCard = fidatyPage && discountPct !== null;
    if (needsCard) conditions.push("Descuento Fìdaty (probable: confirmar en el volantino)");
    if (/1\s*\+\s*1\s*GRATIS/i.test(cellItems.map((i) => i.str).join(" "))) conditions.push("1+1 gratis");
    if (hasVariants(fullName)) conditions.push("Varios formatos o gustos: confirma el tamano en el local");

    offers.push({
      store: "esselunga",
      page: page.page,
      name: fullName,
      brand: null,
      priceCents: a.cents,
      regularCents: old && old.cents > a.cents ? old.cents : null,
      discountPct:
        discountPct ?? (old && old.cents > a.cents ? Math.round(((old.cents - a.cents) / old.cents) * 100) : null),
      unitPriceCents: unitCents,
      unitPriceLabel: unitLabel,
      perKg,
      needsCard,
      condition: conditions.length ? conditions.join(" · ") : null,
      packSize: pack?.size ?? null,
      packUnit: pack?.unit ?? null,
      category: categorize(fullName),
    });
  }
  return offers;
}
