import type { PageItems, TextItem } from "./types";

type PdfTextItem = { str?: string; transform?: number[]; width?: number; height?: number };
type PdfPage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
};
export type PdfDocLike = { numPages: number; getPage(n: number): Promise<PdfPage> };

/** Convierte el contenido de texto de pdf.js a items con y medida desde arriba. Funciona igual en Node y en el navegador. */
export async function extractPageItems(doc: PdfDocLike, pageNo: number): Promise<PageItems> {
  const page = await doc.getPage(pageNo);
  const view = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const it of content.items) {
    const str = it.str ?? "";
    if (!str.trim() || !it.transform) continue;
    const [a, b, , d, e, f] = it.transform;
    const size = Math.hypot(a, b) || Math.abs(d);
    items.push({
      str,
      x: e,
      y: view.height - f - size,
      w: it.width ?? 0,
      h: size,
      size,
    });
  }
  return { page: pageNo, width: view.width, height: view.height, items };
}
