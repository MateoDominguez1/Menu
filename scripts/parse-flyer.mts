import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isEsselungaFoodPage, parseEsselungaPage } from "../src/lib/flyer/parse-esselunga";
import { parseIperPage } from "../src/lib/flyer/parse-iper";
import { extractPageItems, type PdfDocLike } from "../src/lib/flyer/pdf-items";
import type { ParsedOffer } from "../src/lib/flyer/types";

const [file, store, pagesArg, outFile] = process.argv.slice(2);
const doc = (await getDocument({
  data: new Uint8Array(readFileSync(file)),
  useSystemFonts: true,
  disableFontFace: true,
  verbosity: 0,
}).promise) as unknown as PdfDocLike;

const pages =
  pagesArg && pagesArg !== "all" ? pagesArg.split(",").map(Number) : Array.from({ length: doc.numPages }, (_, i) => i + 1);
const fmt = (c: number | null) => (c === null ? "-" : (c / 100).toFixed(2));
const all: ParsedOffer[] = [];
const quiet = process.env.QUIET === "1";
for (const p of pages) {
  const page = await extractPageItems(doc, p);
  const heading =
    page.items
      .filter((i) => i.size >= 17 && i.y < 120 && !/^[\d€,.%\s]+$/.test(i.str))
      .sort((a, b) => a.y - b.y || a.x - b.x)[0]?.str.trim() ?? "";
  let offers: ParsedOffer[];
  if (store === "iper") offers = parseIperPage(page, heading);
  else {
    const text = page.items.map((i) => i.str).join(" ");
    offers = isEsselungaFoodPage(heading, text) ? parseEsselungaPage(page) : [];
  }
  all.push(...offers);
  console.log(`\n== p${p} [${heading}] ${offers.length} ofertas`);
  if (quiet) continue;
  for (const o of offers) {
    console.log(
      `${fmt(o.priceCents).padStart(6)} ${fmt(o.regularCents).padStart(6)} ${String(o.discountPct ?? "").padStart(3)}% ${o.perKg ? "/kg" : "   "} ${(o.packSize ?? "").toString().padStart(5)}${o.packUnit ?? ""} ${o.needsCard ? "CARD" : "    "} ${o.category.padEnd(18)} ${o.brand ? `[${o.brand}] ` : ""}${o.name}${o.condition ? "  <" + o.condition + ">" : ""}`,
    );
  }
}
console.log(`\nTOTAL ${all.length} ofertas`);
if (outFile) writeFileSync(outFile, JSON.stringify(all, null, 1));
