import type { BaseUnit } from "@/db/schema";
import type { IngredientLite } from "@/lib/types";
import { isValidISODate } from "@/lib/dates";
import { parseEuros } from "@/lib/money";

/**
 * Formato esperado (separador coma o punto y coma, con encabezado):
 * tienda,ingrediente,producto,marca,tamano,unidad,precio,promo,vigente_hasta,fecha,fuente,al_peso
 * Ejemplo:
 * esselunga,Pechuga de pollo,Petto di pollo,,1000,g,8.48,,2026-10-21,2026-10-08,Volantino,si
 */
export const CSV_HEADER =
  "tienda,ingrediente,producto,marca,tamano,unidad,precio,promo,vigente_hasta,fecha,fuente,al_peso";

export type ParsedPriceRow = {
  storeId: number;
  ingredientId: number;
  productName: string;
  brand: string | null;
  packSize: number;
  packUnit: BaseUnit;
  soldByWeight: boolean;
  priceCents: number;
  promoCents: number | null;
  validUntil: string | null;
  observedAt: string;
  source: string;
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parsePricesCsv(
  text: string,
  storesBySlug: Map<string, number>,
  ingredientsByName: Map<string, IngredientLite>,
): { rows: ParsedPriceRow[]; errors: string[] } {
  const rows: ParsedPriceRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows, errors: ["El archivo esta vacio"] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const required = ["tienda", "ingrediente", "producto", "tamano", "unidad", "precio"];
  const missing = required.filter((r) => col(r) === -1);
  if (missing.length > 0) {
    return { rows, errors: [`Faltan columnas: ${missing.join(", ")}`] };
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    const get = (name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? ""));
    const n = i + 1;
    const storeId = storesBySlug.get(get("tienda").toLowerCase());
    if (!storeId) {
      errors.push(`Linea ${n}: tienda desconocida "${get("tienda")}"`);
      continue;
    }
    const ing = ingredientsByName.get(get("ingrediente").toLowerCase());
    if (!ing) {
      errors.push(`Linea ${n}: ingrediente desconocido "${get("ingrediente")}"`);
      continue;
    }
    const unit = get("unidad").toLowerCase();
    if (unit !== "g" && unit !== "ml" && unit !== "unit") {
      errors.push(`Linea ${n}: unidad invalida "${get("unidad")}" (usa g, ml o unit)`);
      continue;
    }
    const packSize = parseFloat(get("tamano").replace(",", "."));
    if (!Number.isFinite(packSize) || packSize <= 0) {
      errors.push(`Linea ${n}: tamano invalido`);
      continue;
    }
    const price = parseEuros(get("precio"));
    if (price === null) {
      errors.push(`Linea ${n}: precio invalido "${get("precio")}"`);
      continue;
    }
    const promoRaw = get("promo");
    const promo = promoRaw ? parseEuros(promoRaw) : null;
    if (promoRaw && promo === null) {
      errors.push(`Linea ${n}: promo invalida "${promoRaw}"`);
      continue;
    }
    const until = get("vigente_hasta");
    if (until && !isValidISODate(until)) {
      errors.push(`Linea ${n}: fecha "vigente_hasta" invalida`);
      continue;
    }
    const observed = get("fecha");
    if (observed && !isValidISODate(observed)) {
      errors.push(`Linea ${n}: fecha invalida`);
      continue;
    }
    rows.push({
      storeId,
      ingredientId: ing.id,
      productName: get("producto"),
      brand: get("marca") || null,
      packSize,
      packUnit: unit,
      soldByWeight: ["si", "sí", "1", "true"].includes(get("al_peso").toLowerCase()),
      priceCents: price,
      promoCents: promo,
      validUntil: until || null,
      observedAt: observed || new Date().toISOString().slice(0, 10),
      source: get("fuente") || "Importacion CSV",
    });
  }
  return { rows, errors };
}
