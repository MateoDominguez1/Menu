import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPageItems, type PdfDocLike } from "../src/lib/flyer/pdf-items";

const [file] = process.argv.slice(2);
const doc = (await getDocument({
  data: new Uint8Array(readFileSync(file)),
  useSystemFonts: true,
  disableFontFace: true,
  verbosity: 0,
}).promise) as unknown as PdfDocLike;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await extractPageItems(doc, p);
  const big = page.items
    .filter((i) => i.size >= 17 && i.y < 120 && !/^[\d€,.%\s]+$/.test(i.str))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .slice(0, 4);
  const prices = page.items.filter((i) => /\d{1,3},\d{2}/.test(i.str) && i.size >= 18).length;
  console.log(`p${String(p).padStart(2)} precios~${String(prices).padStart(2)} | ${big.join(" / ")}`);
}
