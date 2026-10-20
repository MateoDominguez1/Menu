import { describe, expect, it } from "vitest";
import { detectStore, detectValidity, isIperFoodPage } from "./index";
import { mapOfferToIngredient, toProductDraft } from "./mapping";
import { isEsselungaFoodPage, parseEsselungaPage } from "./parse-esselunga";
import { parseIperPage } from "./parse-iper";
import { categorize, hasVariants, parseEuroCents, parsePack } from "./shared";
import type { PageItems, TextItem } from "./types";

const it_ = (str: string, x: number, y: number, size: number, w = str.length * size * 0.45): TextItem => ({
  str,
  x,
  y,
  w,
  h: size,
  size,
});

function page(items: TextItem[], n = 4): PageItems {
  return { page: n, width: 822, height: 822, items };
}

/** Celda de Iper: nombre arriba (9 pt), precio grande abajo, precio por kg a la derecha o debajo. */
function iperCell(col: number, y: number, lines: string[], price: string, opts: { old?: string; unit?: string; pct?: string; card?: boolean } = {}): TextItem[] {
  const x = [19.8, 220.4, 420.9, 621.5][col];
  const out: TextItem[] = lines.map((l, i) => it_(l, x, y + i * 10.8, 9));
  const py = y + 120;
  out.push(it_("€", x + 66, py + 20, 25, 14));
  out.push(it_(price, x + 86, py, 45, 60));
  if (opts.old) out.push(it_(opts.old, x + 66, py - 22, 10, 28));
  if (opts.unit) out.push(it_(opts.unit, x + 66, py + 49, 8, 40));
  if (opts.pct) {
    out.push(it_("SCONTO", x + 6, py + 1, 15, 50));
    out.push(it_(opts.pct, x + 3, py + 7, 42, 54));
  }
  if (opts.card) out.push(it_("CARTA VANTAGGI", x + 8, py + 24, 7, 50));
  return out;
}

describe("parseEuroCents y parsePack", () => {
  it("lee importes", () => {
    expect(parseEuroCents("€ 9,99")).toBe(999);
    expect(parseEuroCents("12,90")).toBe(1290);
    expect(parseEuroCents("abc")).toBeNull();
  });

  it("lee tamanos de envase en las formas del volantino", () => {
    expect(parsePack("Mozzarella 125 g x3")).toMatchObject({ size: 375, unit: "g" });
    expect(parsePack("Hamburger 2x125 g")).toMatchObject({ size: 250, unit: "g" });
    expect(parsePack("Latte UHT 1 l")).toMatchObject({ size: 1000, unit: "ml" });
    expect(parsePack("10 Uova da allevamento a terra")).toMatchObject({ size: 10, unit: "unit" });
    expect(parsePack("Pasta 500 g")).toMatchObject({ size: 500, unit: "g" });
    expect(parsePack("Succo 50 cl")).toMatchObject({ size: 500, unit: "ml" });
    expect(parsePack("Banane sfuse")).toBeNull();
  });

  it("detecta formatos variables", () => {
    expect(hasVariants("Pesti Tigullio gusti assortiti 185 g / 190 g")).toBe(true);
    expect(hasVariants("Mozzarella 125 g x3")).toBe(false);
  });
});

describe("categorize", () => {
  it("separa lo que se confunde por palabras compartidas", () => {
    expect(categorize("Patate a pasta gialla per tutti gli usi 2,5 kg")).toBe("fruta_verdura");
    expect(categorize("Gnocchi di patate 400 g")).toBe("pasta_arroz");
    expect(categorize("Yogurt bianco naturale extra cremoso Fior di latte 1 kg")).toBe("lacteos_huevos");
    expect(categorize("Mozzarella di latte di Bufala 100 g x3")).toBe("fiambres_quesos");
    expect(categorize("Passata di pomodoro 700 g")).toBe("conservas_despensa");
    expect(categorize("Pomodori Ciliegino 500 g")).toBe("fruta_verdura");
    expect(categorize("Pizza margherita surgelata")).toBe("congelados");
    expect(categorize("Petto di pollo")).toBe("carne");
    expect(categorize("Orata allevata in Croazia")).toBe("pescado");
    expect(categorize("Biscotti Pan di Stelle 1 kg")).toBe("snacks_dulces");
  });
});

describe("parseIperPage", () => {
  const items = [
    it_("I NOSTRI FRESCHI", 19.8, 7.9, 21, 148),
    ...iperCell(0, 40, ["Petto di pollo"], "9,99", { old: "€ 12,90", unit: "al kg", pct: "22%" }),
    ...iperCell(1, 40, ["Yogurt bianco intero o zero grassi 125 g x8", "MÜLLER"], "1,99", { unit: "al kg € 1,99" }),
    ...iperCell(2, 40, ["Mozzarella 125 g x3", "IPER"], "2,29", { old: "€ 3,19", unit: "al kg € 6,11", pct: "28%", card: true }),
    ...iperCell(3, 40, ["10 Uova da allevamento a terra", "AIA"], "3,49"),
    ...iperCell(0, 330, ["Funghi Champignon 1 kg"], "2,49"),
  ];
  const offers = parseIperPage(page(items), "I NOSTRI FRESCHI");

  it("asocia cada precio con el nombre de su columna", () => {
    expect(offers.map((o) => o.name)).toEqual([
      "Petto di pollo",
      "Yogurt bianco intero o zero grassi 125 g x8",
      "Mozzarella 125 g x3",
      "10 Uova da allevamento a terra",
      "Funghi Champignon 1 kg",
    ]);
  });

  it("reconoce precio por kg, precio habitual, descuento y tarjeta", () => {
    const pollo = offers[0];
    expect(pollo).toMatchObject({ priceCents: 999, regularCents: 1290, discountPct: 22, perKg: true, category: "carne" });
    const mozz = offers[2];
    expect(mozz).toMatchObject({ priceCents: 229, regularCents: 319, needsCard: true, packSize: 375, packUnit: "g" });
    expect(mozz.condition).toContain("Carta Vantaggi");
  });

  it("separa la marca (ultima linea en mayusculas) y calcula el tamano", () => {
    expect(offers[1].brand).toBe("MÜLLER");
    expect(offers[1]).toMatchObject({ packSize: 1000, packUnit: "g", perKg: false });
    expect(offers[3]).toMatchObject({ brand: "AIA", packSize: 10, packUnit: "unit" });
  });

  it("ignora productos que no son alimentos", () => {
    const nf = parseIperPage(
      page([
        it_("I NOSTRI FRESCHI", 19.8, 7.9, 21),
        ...iperCell(0, 40, ["Carta igienica Mega 8 rotoli"], "3,99"),
        ...iperCell(1, 40, ["Pasta di semola 500 g"], "0,59"),
        ...iperCell(2, 40, ["Hamburger"], "3,00"),
        ...iperCell(3, 40, ["Latte"], "1,00"),
        ...iperCell(0, 330, ["Mele Fuji"], "1,59"),
        ...iperCell(1, 330, ["Pere"], "1,89"),
        ...iperCell(2, 330, ["Cachi"], "1,99"),
        ...iperCell(3, 330, ["Kiwi"], "2,49"),
      ]),
      "I NOSTRI FRESCHI",
    );
    expect(nf.some((o) => /igienica/i.test(o.name))).toBe(false);
    expect(nf.some((o) => /Pasta di semola/.test(o.name))).toBe(true);
  });

  it("no inventa ofertas en una pagina sin precios", () => {
    expect(parseIperPage(page([it_("PULITO E ORDINE", 19.8, 7.9, 21)]), "PULITO E ORDINE")).toEqual([]);
  });
});

describe("parseEsselungaPage", () => {
  function esselungaCell(x: number, y: number, name: string[], desc: string[], old: string, unit: string[], pct: string, newInt: string, newDec: string): TextItem[] {
    const out: TextItem[] = [];
    name.forEach((l, i) => out.push(it_(l, x, y + i * 10, 9)));
    desc.forEach((l, i) => out.push(it_(l, x, y + name.length * 10 + i * 10, 8)));
    const py = y + 140;
    out.push(it_("€", x, py, 14, 10.5), it_(old, x + 15, py, 14, 29));
    out.push(it_(pct, x + 54, py + 32, 27.8, 38), it_(`${pct}%`, x + 54, py + 32, 27.8, 46));
    out.push(it_("€", x, py + 78, 23.4, 17.5), it_(`${newInt},`, x + 25, py + 65, 36, 32), it_(newDec, x + 57, py + 68, 21, 25));
    out.push(it_("(", x, py + 106, 8, 2), it_("€", x + 2, py + 106, 8, 6), it_(`${unit[0]} al kg)`, x + 10, py + 106, 8, 42));
    return out;
  }
  const items = [
    it_("SCONTI FINO AL 50%", 24, 40, 35),
    it_("GLI SCONTI FÌDATY SONO RISERVATI AI POSSESSORI DI CARTE FÌDATY", 835, 766, 10, 340),
    ...esselungaCell(34.3, 100, ["PASTA DI SEMOLA", "VOIELLO"], ["500 g"], "1,49", ["1,48"], "50", "0", "74"),
    ...esselungaCell(300.8, 100, ["MOZZARELLA", "GRANAROLO"], ["4x100 g"], "4,78", ["5,98"], "50", "2", "39"),
  ];
  const offers = parseEsselungaPage(page(items, 5), "SCONTI FINO AL 50%");

  it("lee el precio partido en entero y decimales y el precio habitual", () => {
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ priceCents: 74, regularCents: 149, discountPct: 50, packSize: 500, packUnit: "g" });
    expect(offers[1]).toMatchObject({ priceCents: 239, regularCents: 478, packSize: 400, packUnit: "g" });
  });

  it("marca Fidaty como probable cuando la pagina lo menciona y hay descuento", () => {
    expect(offers[0].needsCard).toBe(true);
    expect(offers[0].condition).toContain("Fìdaty");
  });

  it("descarta paginas que no son de alimentos", () => {
    expect(isEsselungaFoodPage("SCONTI FINO AL 50%", "CURA CASA detersivi")).toBe(false);
    expect(isEsselungaFoodPage("CARNE", "")).toBe(true);
    expect(isEsselungaFoodPage("ENOTECA", "")).toBe(true);
  });
});

describe("deteccion de tienda y vigencia", () => {
  it("lee las fechas en los formatos de ambos volantinos", () => {
    expect(detectValidity("DAL 12 AL 25 OTTOBRE OFFERTE IMPERDIBILI", "2026-10-20")).toEqual({ from: "2026-10-12", until: "2026-10-25" });
    expect(detectValidity("8 - 21 OTTOBRE SCONTI", "2026-10-20")).toEqual({ from: "2026-10-08", until: "2026-10-21" });
    expect(detectValidity("DALL’8 AL 21 OTTOBRE 2026 NELLE PROVINCE", "2025-01-01")).toEqual({ from: "2026-10-08", until: "2026-10-21" });
    expect(detectValidity("sin fechas", "2026-10-20")).toEqual({ from: null, until: null });
  });

  it("identifica la tienda por sus marcas", () => {
    expect(detectStore("SCONTO CARTA VANTAGGI IPER PREZZO")).toBe("iper");
    expect(detectStore("GLI SCONTI FÌDATY PUNTI FRAGOLA")).toBe("esselunga");
    expect(detectStore("hola")).toBeNull();
  });

  it("filtra las secciones de Iper que no son comida", () => {
    expect(isIperFoodPage("LA DISPENSA")).toBe(true);
    expect(isIperFoodPage("I NOSTRI FRESCHI")).toBe(true);
    expect(isIperFoodPage("PULITO E ORDINE")).toBe(false);
    expect(isIperFoodPage("BELLEZZA E IGIENE")).toBe(false);
    expect(isIperFoodPage("")).toBe(false);
  });
});

describe("mapeo a ingredientes", () => {
  it("liga solo cuando es claro", () => {
    expect(mapOfferToIngredient({ name: "Petto di pollo" })).toBe("Pechuga de pollo");
    expect(mapOfferToIngredient({ name: "Petto di pollo al forno" })).toBeNull();
    expect(mapOfferToIngredient({ name: "10 Uova da allevamento a terra" })).toBe("Huevos");
    expect(mapOfferToIngredient({ name: "Pomodori Ciliegino o Piccadilly 500 g" })).toBe("Tomate");
    expect(mapOfferToIngredient({ name: "Passata di pomodoro 700 g" })).toBeNull();
    expect(mapOfferToIngredient({ name: "Pasta fresca ripiena 250 g" })).toBeNull();
    expect(mapOfferToIngredient({ name: "Pasta di semola formati assortiti 500 g" })).toBe("Pasta seca");
    expect(mapOfferToIngredient({ name: "Mozzarella di latte di Bufala 100 g x3" })).toBeNull();
    expect(mapOfferToIngredient({ name: "Gnocchi di patate" })).toBeNull();
  });

  it("solo crea producto si la unidad es compatible con el ingrediente", () => {
    expect(toProductDraft({ perKg: true, packSize: null, packUnit: null }, "g")).toEqual({ packSize: 1000, packUnit: "g", soldByWeight: true });
    expect(toProductDraft({ perKg: false, packSize: 375, packUnit: "g" }, "g")).toEqual({ packSize: 375, packUnit: "g", soldByWeight: false });
    expect(toProductDraft({ perKg: false, packSize: 1000, packUnit: "ml" }, "g")).toBeNull();
    expect(toProductDraft({ perKg: false, packSize: 10, packUnit: "unit" }, "unit")).toEqual({ packSize: 10, packUnit: "unit", soldByWeight: false });
    expect(toProductDraft({ perKg: true, packSize: null, packUnit: null }, "ml")).toBeNull();
    expect(toProductDraft({ perKg: false, packSize: null, packUnit: null }, "g")).toBeNull();
  });
});
