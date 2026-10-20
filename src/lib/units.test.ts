import { describe, expect, it } from "vitest";
import { formatQuantity, toBaseQuantity } from "./units";
import { parseEuros } from "./money";

describe("toBaseQuantity", () => {
  it("convierte kg a g y l a ml", () => {
    expect(toBaseQuantity(1.5, "kg", { baseUnit: "g" })).toBe(1500);
    expect(toBaseQuantity(2, "l", { baseUnit: "ml" })).toBe(2000);
  });

  it("convierte unidades a gramos solo si se conoce el peso por unidad", () => {
    expect(toBaseQuantity(2, "unit", { baseUnit: "g", gramsPerUnit: 60 })).toBe(120);
    expect(() => toBaseQuantity(2, "unit", { baseUnit: "g" })).toThrow();
  });

  it("convierte gramos a unidades cuando la base es unidad", () => {
    expect(toBaseQuantity(120, "g", { baseUnit: "unit", gramsPerUnit: 60 })).toBe(2);
  });

  it("rechaza mezclar volumen y masa", () => {
    expect(() => toBaseQuantity(100, "ml", { baseUnit: "g" })).toThrow();
  });

  it("rechaza cantidades negativas y unidades desconocidas", () => {
    expect(() => toBaseQuantity(-1, "g", { baseUnit: "g" })).toThrow();
    expect(() => toBaseQuantity(1, "tazas", { baseUnit: "g" })).toThrow();
  });
});

describe("formatQuantity", () => {
  it("usa kg y L desde 1000", () => {
    expect(formatQuantity(1500, "g")).toBe("1,5 kg");
    expect(formatQuantity(250, "g")).toBe("250 g");
    expect(formatQuantity(2, "unit")).toBe("2 u");
  });
});

describe("parseEuros", () => {
  it("acepta coma o punto y rechaza texto invalido", () => {
    expect(parseEuros("2,50")).toBe(250);
    expect(parseEuros("€3.8")).toBe(380);
    expect(parseEuros("abc")).toBeNull();
    expect(parseEuros("")).toBeNull();
  });
});
