import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePricesCsv } from "./csv-prices";
import { ingredients as seedIngredients } from "@/db/seed-data";
import { ing } from "@/lib/fixtures";

const csv = readFileSync(join(process.cwd(), "price-data", "volantini-2026-10-12.csv"), "utf8");
const stores = new Map([
  ["esselunga", 1],
  ["iper", 2],
]);
const ingredients = new Map(seedIngredients.map((i, idx) => [i.name.toLowerCase(), ing(idx + 1, i.name, i.baseUnit)]));

describe("CSV de volantinos 12-oct-2026", () => {
  const { rows, errors } = parsePricesCsv(csv, stores, ingredients);

  it("se importa completo y sin errores con los ingredientes de la app", () => {
    expect(errors).toEqual([]);
    expect(rows.length).toBe(csv.trim().split("\n").length - 1);
  });

  it("toda fila trae fuente, fecha y vigencia", () => {
    expect(rows.every((r) => !!r.source && !!r.observedAt && !!r.validUntil)).toBe(true);
  });

  it("la promo nunca supera el precio habitual", () => {
    expect(rows.every((r) => r.promoCents === null || r.promoCents < r.priceCents)).toBe(true);
  });

  it("respeta las vigencias de cada volantino", () => {
    expect(rows.filter((r) => r.storeId === 2).every((r) => r.validUntil === "2026-10-25")).toBe(true);
    expect(rows.filter((r) => r.storeId === 1).every((r) => r.validUntil === "2026-10-21")).toBe(true);
  });

  it("incluye valores clave leidos de las imagenes", () => {
    const find = (store: number, name: string) => rows.find((r) => r.storeId === store && r.productName === name)!;
    expect(find(2, "Funghi champignon 1 kg").priceCents).toBe(249);
    expect(find(2, "Patate a pasta gialla 2,5 kg").priceCents).toBe(245);
    expect(find(2, "Uva bianca senza semi 1 kg").priceCents).toBe(259);
    expect(find(2, "Petto di pollo (al taglio)")).toMatchObject({ priceCents: 1290, promoCents: 999, soldByWeight: true });
    expect(find(1, "Pasta di semola 500 g")).toMatchObject({ priceCents: 149, promoCents: 74 });
  });
});
