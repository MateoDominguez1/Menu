import { categorize, findAmounts, hasVariants, isUpper, looksNonFood, parseEuroCents, parsePack } from "./shared";
import type { PageItems, ParsedOffer, TextItem } from "./types";

type Block = { x: number; top: number; bottom: number; lines: string[] };
type Anchor = { item: TextItem; cents: number; left: number };

const NAME_MIN = 8.4;
const NAME_MAX = 9.7;

function priceAnchors(items: TextItem[]): Anchor[] {
  const out: Anchor[] = [];
  for (const it of items) {
    if (it.size < 22 || it.size > 52) continue;
    const m = it.str.replace(/\s/g, "").match(/^€?(\d{1,3},\d{2})$/);
    if (!m) continue;
    const cents = parseEuroCents(m[1]);
    if (cents === null) continue;
    // El "€" suele ser un fragmento aparte, a la izquierda y en la misma fila.
    const euro = items.find(
      (e) => e !== it && /^€$/.test(e.str.trim()) && e.x < it.x && it.x - e.x < 40 && Math.abs(e.y + e.h / 2 - (it.y + it.h / 2)) < 30,
    );
    out.push({ item: it, cents, left: euro ? Math.min(euro.x, it.x) : it.x });
  }
  return out;
}

function nameItems(page: PageItems): TextItem[] {
  return page.items.filter(
    (i) =>
      i.size >= NAME_MIN &&
      i.size <= NAME_MAX &&
      i.y < page.height - 32 &&
      i.y > 30 &&
      !/^[\d\s€,.%]+$/.test(i.str) &&
      !/^al\s/i.test(i.str.trim()),
  );
}

function clusterColumns(names: TextItem[]): number[] {
  const xs = names.map((n) => n.x).sort((a, b) => a - b);
  const clusters: { sum: number; n: number }[] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(x - last.sum / last.n) < 6) {
      last.sum += x;
      last.n += 1;
    } else clusters.push({ sum: x, n: 1 });
  }
  // Paginas normales: columnas con 3+ lineas de nombre. Paginas casi vacias: se acepta 2.
  const strong = clusters.filter((c) => c.n >= 3);
  const chosen = strong.length >= 2 ? strong : clusters.filter((c) => c.n >= 2);
  return chosen.map((c) => c.sum / c.n);
}

function columnOf(columns: number[], x: number): number {
  let best = 0;
  for (let i = 0; i < columns.length; i++) if (columns[i] <= x + 4) best = i;
  return best;
}

function buildBlocks(names: TextItem[], columns: number[]): Block[][] {
  const perColumn: TextItem[][] = columns.map(() => []);
  for (const n of names) perColumn[columnOf(columns, n.x)]?.push(n);
  return perColumn.map((col) => {
    const sorted = col.slice().sort((a, b) => a.y - b.y);
    const blocks: Block[] = [];
    for (const it of sorted) {
      const last = blocks[blocks.length - 1];
      if (last && it.y - last.bottom < 8 && it.y >= last.top) {
        last.lines.push(it.str.trim());
        last.bottom = it.y + it.h;
      } else blocks.push({ x: it.x, top: it.y, bottom: it.y + it.h, lines: [it.str.trim()] });
    }
    return blocks;
  });
}

function nearby(items: TextItem[], box: { x0: number; x1: number; y0: number; y1: number }): TextItem[] {
  return items.filter((i) => i.x >= box.x0 && i.x <= box.x1 && i.y >= box.y0 && i.y <= box.y1);
}

export function parseIperPage(page: PageItems, heading: string): ParsedOffer[] {
  const names = nameItems(page);
  const columns = clusterColumns(names);
  if (columns.length === 0) return [];
  const blocks = buildBlocks(names, columns);
  const anchors = priceAnchors(page.items).sort((a, b) => a.item.y - b.item.y);

  const used = new Set<Block>();
  const lastAnchorY: number[] = columns.map(() => -Infinity);
  const offers: ParsedOffer[] = [];

  for (const a of anchors) {
    const col = columnOf(columns, a.left);
    const colBlocks = blocks[col] ?? [];
    const prevY = lastAnchorY[col];
    lastAnchorY[col] = a.item.y;

    const block = colBlocks
      .filter((b) => b.bottom <= a.item.y + 2 && b.top > prevY - 4 && !used.has(b))
      .sort((x, y) => y.bottom - x.bottom)[0];
    let lines: string[];
    if (block) {
      used.add(block);
      lines = block.lines;
    } else {
      // Nombre debajo del precio (cajas destacadas): primeras lineas chicas bajo el importe.
      const nextLeft = anchors
        .filter((o) => o !== a && Math.abs(o.item.y - a.item.y) < 30 && o.left > a.left + 20)
        .map((o) => o.left)
        .sort((x, y) => x - y)[0];
      const below = nearby(
        page.items.filter((i) => i.size >= 6.5 && i.size <= NAME_MAX && !/^al\s/i.test(i.str.trim()) && !/^[\d\s€,.%]+$/.test(i.str)),
        { x0: Math.min(a.left, columns[col] ?? a.left) - 6, x1: Math.min(a.left + 170, (nextLeft ?? Infinity) - 8), y0: a.item.y + 28, y1: a.item.y + 90 },
      ).sort((x, y) => x.y - y.y);
      lines = below.slice(0, 3).map((i) => i.str.trim());
    }
    if (lines.length === 0) continue;

    // Marca = ultima linea en mayusculas, corta y sin digitos.
    let brand: string | null = null;
    let nameLines = lines;
    if (lines.length >= 2) {
      const last = lines[lines.length - 1];
      if (isUpper(last) && last.length <= 30 && !/\d/.test(last)) {
        brand = last;
        nameLines = lines.slice(0, -1);
      }
    }
    const name = nameLines.join(" ").replace(/\s+/g, " ").trim();
    if (!name || looksNonFood(name)) continue;

    const cx0 = columns[col] - 6;
    const cell = { x0: cx0, x1: cx0 + 205, y0: a.item.y - 150, y1: a.item.y + 55 };
    const around = nearby(page.items, cell);

    const oldPrice = around
      .filter((i) => {
        if (!(i.size >= 9 && i.size <= 13.5 && /^€\s*\d{1,4},\d{2}$/.test(i.str.trim()) && i.y < a.item.y && a.item.y - i.y < 55 && i.x >= a.left - 6 && i.x <= a.left + 80)) return false;
        const v = parseEuroCents(i.str.trim());
        return v !== null && v > a.cents; // el precio habitual siempre es mayor que el de oferta
      })
      .sort((x, y) => y.y - x.y)[0];
    const unitItem = around
      .filter((i) => i.size >= 7 && i.size <= 9 && /^al\s+(kg|l|etto|pezzo|litro)/i.test(i.str.trim()) && i.y > a.item.y + 8 && i.y < a.item.y + 70 && Math.abs(i.x - a.left) < 14)
      .sort((x, y) => x.y - y.y)[0];
    const discountItem = around.find(
      (i) => i.size >= 28 && /^\d{1,2}%$/.test(i.str.trim()) && i.x < a.item.x && a.item.x - i.x < 130 && Math.abs(i.y - a.item.y) < 45,
    );

    const regionText = around.map((i) => i.str).join(" ");
    const needsCard = /CARTA\s+VANTAGGI/i.test(regionText);
    const conditions: string[] = [];
    if (/1\s*\+\s*1\s*GRATIS/i.test(regionText)) conditions.push("1+1 gratis: el precio es por 2 piezas");
    if (/3\s*x\s*2/i.test(regionText) || /\b3\s*PEZZI\b/i.test(regionText)) conditions.push("3x2: el precio es por 3 piezas");
    else if (/\b2\s*PEZZI\b/i.test(regionText)) conditions.push("Precio por 2 piezas (1+1 gratis)");
    const pack = /A\s+CONFEZIONE\s+€\s*(\d+,\d{2})/i.exec(regionText);
    if (pack) conditions.push(`Por bolsa/envase: € ${pack[1]}`);
    if (needsCard) conditions.push("Requiere Carta Vantaggi");

    // "al kg" puede ir debajo del precio o a su derecha (fruta y verdura).
    const sideUnit = around.find(
      (i) => i.size >= 7 && i.size <= 9 && /^al\s+kg\s*$/i.test(i.str.trim()) && i.x > a.item.x && i.x - a.item.x < 120 && Math.abs(i.y - (a.item.y + a.item.h)) < 24,
    );
    const unitText = unitItem?.str.trim() ?? sideUnit?.str.trim() ?? "";
    let priceIsPerKg = /^al\s+kg\s*$/i.test(unitText);
    let priceCents = a.cents;
    const bagPrice = pack ? parseEuroCents(`€ ${pack[1]}`) : null;
    let perKgCents: number | null = null;
    if (priceIsPerKg && bagPrice !== null) {
      // Bolsa preenvasada con precio por kg y precio de la bolsa: se paga la bolsa.
      perKgCents = a.cents;
      priceCents = bagPrice;
      priceIsPerKg = false;
    }
    const unitCents = perKgCents ?? (unitText.includes("€") ? (findAmounts(unitText)[0] ?? null) : null);
    const unitLabel: "kg" | "L" | null = /^al\s+l/i.test(unitText) ? "L" : /^al\s+kg/i.test(unitText) ? "kg" : null;

    let packInfo = priceIsPerKg ? null : parsePack(name);
    if (!priceIsPerKg && unitCents && packInfo) {
      const implied = (priceCents / unitCents) * 1000;
      const ratio = implied / packInfo.size;
      if (packInfo.unit !== "unit" && (ratio < 0.8 || ratio > 1.25)) packInfo = null;
    }
    if (!priceIsPerKg && !packInfo && unitCents && unitLabel) {
      packInfo = { size: Math.round((priceCents / unitCents) * 1000), unit: unitLabel === "kg" ? "g" : "ml", multi: false };
    }
    if (hasVariants(name)) conditions.push("Varios formatos o gustos: confirma el tamano en el local");

    const regularCents = oldPrice ? parseEuroCents(oldPrice.str.trim()) : null;
    const discountPct = discountItem
      ? parseInt(discountItem.str, 10)
      : regularCents && regularCents > priceCents
        ? Math.round(((regularCents - priceCents) / regularCents) * 100)
        : null;

    offers.push({
      store: "iper",
      page: page.page,
      name,
      brand,
      priceCents,
      regularCents,
      discountPct,
      unitPriceCents: priceIsPerKg ? priceCents : unitCents,
      unitPriceLabel: priceIsPerKg ? "kg" : unitCents ? (perKgCents !== null ? "kg" : unitLabel) : null,
      perKg: priceIsPerKg,
      needsCard,
      condition: conditions.length ? conditions.join(" · ") : null,
      packSize: packInfo?.size ?? null,
      packUnit: packInfo?.unit ?? null,
      category: categorize(`${name} ${heading.includes("SURGEL") ? "surgelato" : ""}`),
    });
  }
  return offers;
}
