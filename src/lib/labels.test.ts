import { describe, expect, it } from "vitest";
import { productLabel } from "./labels";

describe("productLabel", () => {
  it("no repite la marca si el nombre ya la incluye", () => {
    expect(productLabel("Smart", "Smart uova fresche")).toBe("Smart uova fresche");
  });
  it("antepone la marca cuando falta", () => {
    expect(productLabel("Esselunga", "Pane morbido 400 g")).toBe("Esselunga Pane morbido 400 g");
  });
  it("pasa la marca al principio cuando el nombre la trae entre parentesis", () => {
    expect(productLabel("Rio Mare", "Tonno all'olio (Rio Mare)")).toBe("Rio Mare Tonno all'olio");
  });
  it("funciona sin marca", () => {
    expect(productLabel(null, "Pomodori")).toBe("Pomodori");
  });
});
