import { describe, expect, it } from "vitest";
import { CSV_HEADER, parsePricesCsv } from "./csv-prices";
import { ing } from "@/lib/fixtures";

const stores = new Map([["esselunga", 1]]);
const ingredients = new Map([["pechuga de pollo", ing(7, "Pechuga de pollo")]]);

describe("parsePricesCsv", () => {
  it("importa filas validas", () => {
    const csv = `${CSV_HEADER}\nesselunga,Pechuga de pollo,Petto di pollo,,1000,g,8.48,,2026-10-21,2026-10-08,Volantino,si`;
    const { rows, errors } = parsePricesCsv(csv, stores, ingredients);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      storeId: 1,
      ingredientId: 7,
      priceCents: 848,
      soldByWeight: true,
      validUntil: "2026-10-21",
    });
  });

  it("acepta punto y coma y coma decimal", () => {
    const csv = `${CSV_HEADER.replaceAll(",", ";")}\nesselunga;Pechuga de pollo;Petto;;500;g;4,25;;;;;no`;
    const { rows } = parsePricesCsv(csv, stores, ingredients);
    expect(rows[0].priceCents).toBe(425);
  });

  it("reporta errores por linea sin frenar el resto", () => {
    const csv = [
      CSV_HEADER,
      "iper,Pechuga de pollo,X,,500,g,3,,,,,no",
      "esselunga,Inexistente,X,,500,g,3,,,,,no",
      "esselunga,Pechuga de pollo,X,,500,kg,3,,,,,no",
      "esselunga,Pechuga de pollo,X,,500,g,abc,,,,,no",
      "esselunga,Pechuga de pollo,Bueno,,500,g,3.5,,,,,no",
    ].join("\n");
    const { rows, errors } = parsePricesCsv(csv, stores, ingredients);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
  });

  it("rechaza archivos sin las columnas necesarias", () => {
    const { rows, errors } = parsePricesCsv("a,b\n1,2", stores, ingredients);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("Faltan columnas");
  });
});
