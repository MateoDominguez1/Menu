import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPageItems, type PdfDocLike } from "../src/lib/flyer/pdf-items";

const [file, pageArg] = process.argv.slice(2);
const doc = (await getDocument({
  data: new Uint8Array(readFileSync(file)),
  useSystemFonts: true,
  disableFontFace: true,
  verbosity: 0,
}).promise) as unknown as PdfDocLike;

const page = await extractPageItems(doc, Number(pageArg));
console.log(`pagina ${page.page} ${page.width.toFixed(0)}x${page.height.toFixed(0)} items=${page.items.length}`);
for (const it of page.items.slice(0, 60)) {
  console.log(
    `x=${it.x.toFixed(1).padStart(6)} y=${it.y.toFixed(1).padStart(6)} sz=${it.size.toFixed(1).padStart(5)} w=${it.w.toFixed(1).padStart(6)} | ${it.str}`,
  );
}
