import { describe, expect, it } from "vitest";
import { composeRecipes, type ComposerInput } from "./composer";

const ALL = [
  "Pechuga de pollo", "Pollo muslo", "Pavo", "Cerdo magro", "Salchicha fresca", "Hamburguesa de vacuno", "Ternera",
  "Pescado blanco", "Dorada", "Salmon", "Gambas", "Atun al aceite", "Huevos", "Jamon cocido", "Mozzarella", "Ricotta", "Scamorza",
  "Garbanzos", "Frijoles", "Lentejas", "Pasta seca", "Gnocchi", "Arroz", "Cuscus", "Polenta", "Patata", "Pan de molde",
  "Tomate", "Cebolla", "Morron", "Champinones", "Zanahoria", "Calabaza", "Espinaca", "Lechuga", "Hinojo", "Coliflor", "Repollo", "Apio", "Palta",
];

const base = (over: Partial<ComposerInput> = {}): ComposerInput => ({
  available: new Set(ALL),
  deals: new Map([["Pollo muslo", 32], ["Dorada", 10], ["Salchicha fresca", 0], ["Garbanzos", 20], ["Calabaza", 15]]),
  avoid: [],
  existingNames: new Set(),
  seed: 1,
  ...over,
});

const uses = (r: { items: { ingredient: string }[] }, name: string) => r.items.some((i) => i.ingredient === name);

describe("composeRecipes", () => {
  it("compone recetas distintas y con ingredientes estructurados", () => {
    const out = composeRecipes(base());
    expect(out.length).toBeGreaterThan(30);
    expect(new Set(out.map((r) => r.name.toLowerCase())).size).toBe(out.length);
    for (const r of out) {
      expect(r.items.length).toBeGreaterThan(1);
      expect(r.items.every((i) => i.quantity > 0)).toBe(true);
      expect(r.instructions).toContain("1.");
      expect(r.tags).toContain("auto");
    }
  });

  it("solo usa proteinas que estan en oferta (o basicas como huevos y atun)", () => {
    const out = composeRecipes(base());
    const proteins = ["Pechuga de pollo", "Pavo", "Cerdo magro", "Hamburguesa de vacuno", "Ternera", "Pescado blanco", "Salmon", "Gambas", "Jamon cocido", "Mozzarella", "Ricotta", "Scamorza", "Frijoles", "Lentejas"];
    for (const r of out) for (const p of proteins) expect(uses(r, p)).toBe(false);
    expect(out.some((r) => uses(r, "Pollo muslo"))).toBe(true);
    expect(out.some((r) => uses(r, "Dorada"))).toBe(true);
  });

  it("prioriza lo que esta en descuento", () => {
    const out = composeRecipes(base({ total: 12 }));
    const withDeal = out.filter((r) => uses(r, "Pollo muslo") || uses(r, "Garbanzos") || uses(r, "Calabaza") || uses(r, "Dorada"));
    expect(withDeal.length).toBeGreaterThanOrEqual(8);
  });

  it("nunca incluye alimentos a evitar", () => {
    const out = composeRecipes(base({ avoid: ["calabaza", "coliflor"] }));
    expect(out.some((r) => uses(r, "Calabaza") || uses(r, "Coliflor"))).toBe(false);
    expect(out.length).toBeGreaterThan(10);
  });

  it("no repite nombres que ya existen", () => {
    const first = composeRecipes(base());
    const again = composeRecipes(base({ existingNames: new Set(first.map((r) => r.name.toLowerCase())) }));
    const names = new Set(first.map((r) => r.name.toLowerCase()));
    expect(again.every((r) => !names.has(r.name.toLowerCase()))).toBe(true);
  });

  it("limita cuantas recetas usan la misma proteina", () => {
    const out = composeRecipes(base({ total: 60, maxPerProtein: 3 }));
    const count = out.filter((r) => uses(r, "Pollo muslo")).length;
    expect(count).toBeLessThanOrEqual(3 + out.filter((r) => r.name.startsWith("Salteado")).length); // el salteado no tiene muslos
    expect(count).toBeLessThanOrEqual(3);
  });

  it("cambia el menu al cambiar las ofertas y la semilla", () => {
    const a = composeRecipes(base({ seed: 1 })).map((r) => r.name);
    const b = composeRecipes(base({ seed: 2, deals: new Map([["Salmon", 30], ["Lentejas", 25], ["Espinaca", 20], ["Ternera", 40]]) })).map((r) => r.name);
    expect(a).not.toEqual(b);
    expect(b.some((n) => /salmón|lentejas|ternera/i.test(n))).toBe(true);
  });

  it("sin ofertas solo compone con basicos y no falla", () => {
    const out = composeRecipes(base({ deals: new Map() }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.items.every((i) => ["Pasta seca", "Arroz", "Patata", "Cebolla", "Huevos", "Pan de molde", "Tomate", "Atun al aceite", "Zanahoria", "Morron", "Aceite de oliva", "Salsa de soja"].includes(i.ingredient)))).toBe(true);
  });

  it("no usa ingredientes que no existen en la base", () => {
    const out = composeRecipes(base({ available: new Set(["Pasta seca", "Tomate", "Atun al aceite", "Cebolla", "Huevos", "Patata"]) }));
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) for (const i of r.items) expect(["Pasta seca", "Tomate", "Atun al aceite", "Cebolla", "Huevos", "Patata", "Aceite de oliva", "Salsa de soja"]).toContain(i.ingredient);
  });
});
