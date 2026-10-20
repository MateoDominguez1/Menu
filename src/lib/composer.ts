import type { Slot } from "@/db/schema";

export type ComposedRecipe = {
  name: string;
  mealType: Slot;
  minutes: number;
  instructions: string;
  tags: string;
  items: { ingredient: string; quantity: number }[];
};

export type ComposerInput = {
  /** Nombres de ingredientes que existen en la base. */
  available: Set<string>;
  /** Ingrediente -> descuento (0-100) de su mejor oferta vigente. La presencia indica que hay oferta. */
  deals: Map<string, number>;
  /** Fragmentos en minusculas de alimentos a evitar. */
  avoid: string[];
  /** Nombres (minusculas) que ya existen, para no duplicar. */
  existingNames: Set<string>;
  seed: number;
  total?: number;
  maxPerProtein?: number;
  maxPerTemplate?: number;
};

const LABEL: Record<string, string> = {
  "Pechuga de pollo": "pechuga de pollo",
  "Pollo muslo": "muslos de pollo",
  Pavo: "pavo",
  "Cerdo magro": "cerdo",
  "Salchicha fresca": "salchichas",
  "Hamburguesa de vacuno": "hamburguesas",
  Ternera: "ternera",
  "Carne picada de vacuno": "carne picada",
  "Milanesa de cerdo": "milanesas de cerdo",
  "Pescado blanco": "pescado blanco",
  Dorada: "dorada",
  Salmon: "salmón",
  Gambas: "gambas",
  "Atun al aceite": "atún",
  Huevos: "huevo duro",
  "Jamon cocido": "jamón cocido",
  Mozzarella: "mozzarella",
  Ricotta: "ricota",
  Scamorza: "scamorza",
  Garbanzos: "garbanzos",
  Frijoles: "frijoles",
  Lentejas: "lentejas",
  Guisantes: "arvejas",
  "Pasta seca": "pasta",
  Gnocchi: "ñoquis",
  Arroz: "arroz",
  Cuscus: "cuscús",
  Polenta: "polenta",
  Patata: "papas",
  "Pan de molde": "pan",
  Tomate: "tomate",
  Cebolla: "cebolla",
  Morron: "morrón",
  Champinones: "champiñones",
  Zanahoria: "zanahoria",
  Calabaza: "calabaza",
  Espinaca: "espinaca",
  Lechuga: "lechuga",
  Hinojo: "hinojo",
  Coliflor: "coliflor",
  Repollo: "repollo",
  "Judias verdes": "judías verdes",
  Apio: "apio",
  Palta: "palta",
};
const label = (n: string) => LABEL[n] ?? n.toLowerCase();

const MEAT = ["Pechuga de pollo", "Pollo muslo", "Pavo", "Cerdo magro", "Salchicha fresca", "Hamburguesa de vacuno", "Ternera", "Carne picada de vacuno", "Milanesa de cerdo"];
const FISH = ["Pescado blanco", "Dorada", "Salmon", "Gambas"];
const LEGUME = ["Garbanzos", "Frijoles", "Lentejas", "Guisantes"];
const SALAD_VEG = ["Tomate", "Lechuga", "Zanahoria", "Palta", "Apio", "Hinojo", "Repollo", "Judias verdes", "Morron"];
const COOK_VEG = ["Cebolla", "Morron", "Champinones", "Zanahoria", "Calabaza", "Espinaca", "Hinojo", "Coliflor", "Repollo", "Judias verdes", "Tomate"];
const STAPLES = new Set(["Pasta seca", "Arroz", "Patata", "Cebolla", "Huevos", "Pan de molde", "Tomate", "Atun al aceite", "Zanahoria", "Morron"]);
const PROTEINS = new Set([...MEAT, ...FISH, "Atun al aceite", "Huevos", "Jamon cocido", "Mozzarella", "Ricotta", "Scamorza", ...LEGUME]);

type Combo = { template: string; protein: string | null; parts: string[]; recipe: ComposedRecipe };

function jitter(seed: number, key: string): number {
  let h = (seed * 2654435761) >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return (h % 1000) / 1000;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number) => String(Math.round(n));

function sideQty(side: string): number {
  return side === "Patata" ? 250 : side === "Arroz" ? 80 : side === "Cuscus" ? 70 : side === "Polenta" ? 80 : side === "Pasta seca" ? 100 : 60;
}

function proteinQty(p: string): number {
  if (p === "Huevos") return 2;
  if (p === "Atun al aceite") return 70;
  if (p === "Jamon cocido") return 50;
  if (["Mozzarella", "Scamorza"].includes(p)) return 60;
  if (p === "Ricotta") return 80;
  if (LEGUME.includes(p)) return 150;
  if (FISH.includes(p)) return 170;
  return 160;
}

function mk(
  name: string,
  mealType: Slot,
  minutes: number,
  tags: string,
  steps: string[],
  items: [string, number][],
): ComposedRecipe {
  return {
    name,
    mealType,
    minutes,
    tags: `auto,${tags}`,
    instructions: steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    items: items.map(([ingredient, quantity]) => ({ ingredient, quantity })),
  };
}

function sideStep(side: string): string {
  if (side === "Patata") return "Corta las papas en cubos y cocinalas (horno a 200 °C unos 25 min, o hervidas 12 min).";
  if (side === "Arroz") return "Hervi el arroz en agua con sal unos 15 minutos y escurrilo.";
  if (side === "Cuscus") return "Hidrata el cuscús con agua caliente (1:1), tapalo 5 minutos y desgranalo.";
  if (side === "Polenta") return "Cocina la polenta en agua con sal, revolviendo, hasta que espese.";
  if (side === "Pasta seca") return "Hervi la pasta en abundante agua con sal y escurrila.";
  return "Tosta el pan.";
}

function build(c: (name: string) => boolean): Combo[] {
  const ok = (names: string[]) => names.filter(c);
  const out: Combo[] = [];
  const push = (template: string, protein: string | null, parts: string[], recipe: ComposedRecipe) =>
    out.push({ template, protein, parts, recipe });

  // 1. A la plancha con guarnicion y verdura
  for (const p of ok([...MEAT.filter((m) => !["Salchicha fresca", "Carne picada de vacuno", "Milanesa de cerdo"].includes(m)), ...FISH, "Salchicha fresca"])) {
    for (const side of ok(["Patata", "Arroz", "Cuscus", "Pan de molde"])) {
      for (const v of ok(COOK_VEG.filter((x) => x !== "Cebolla"))) {
        const fish = FISH.includes(p);
        push("plancha", p, [side, v], mk(
          `${cap(label(p))} a la plancha con ${label(side)} y ${label(v)}`,
          "dinner",
          25,
          `plancha,${fish ? "pescado" : "carne"}`,
          [
            sideStep(side),
            `Seca la ${fish ? "proteina" : "carne"} (${num(proteinQty(p))} g), salpimentala y cocinala a la plancha ${fish ? "3-4" : "5-6"} minutos por lado.`,
            `Saltea ${num(150)} g de ${label(v)} en la misma sarten con un chorrito de aceite 5 minutos.`,
            "Servi todo junto.",
          ],
          [[p, proteinQty(p)], [side, sideQty(side)], [v, 150], ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 2. Al horno con papas y verdura
  for (const p of ok(["Pechuga de pollo", "Pollo muslo", "Pavo", "Cerdo magro", "Ternera", "Salchicha fresca"])) {
    if (!c("Patata")) break;
    for (const v of ok(["Cebolla", "Zanahoria", "Calabaza", "Hinojo", "Coliflor", "Morron", "Judias verdes"])) {
      push("horno", p, ["Patata", v], mk(
        `${cap(label(p))} al horno con papas y ${label(v)}`,
        "dinner",
        p === "Pollo muslo" ? 45 : 40,
        "horno",
        [
          "Precalienta el horno a 200 °C.",
          `Pon 250 g de papas en cubos y 120 g de ${label(v)} en una fuente con aceite, sal y pimienta.`,
          `Agrega ${label(p)} (${num(proteinQty(p))} g) con ajo y un chorrito de aceite.`,
          `Hornea ${p === "Pollo muslo" ? "40" : "30"} minutos, dando vuelta a mitad de cocción.`,
        ],
        [[p, proteinQty(p)], ["Patata", 250], [v, 120], ["Aceite de oliva", 10]],
      ));
    }
  }

  // 3. Salteado sobre arroz / cuscus / pasta
  for (const p of ok(["Pechuga de pollo", "Pavo", "Cerdo magro", "Ternera", "Gambas"])) {
    for (const c1 of ok(["Arroz", "Cuscus", "Pasta seca"])) {
      const vs = ok(COOK_VEG.filter((x) => x !== "Tomate"));
      for (let i = 0; i < vs.length; i++) {
        for (let j = i + 1; j < vs.length; j++) {
          push("salteado", p, [c1, vs[i], vs[j]], mk(
            `Salteado de ${label(p)} con ${label(vs[i])} y ${label(vs[j])} sobre ${label(c1)}`,
            "dinner",
            25,
            "salteado",
            [
              sideStep(c1),
              `Corta ${label(p)} (${num(proteinQty(p))} g) en tiras y doralo en una sarten caliente con aceite.`,
              `Suma ${label(vs[i])} y ${label(vs[j])} en tiras y saltea 6-8 minutos. Condimenta con sal, pimienta y salsa de soja.`,
              `Sirve sobre ${label(c1)}.`,
            ],
            [[p, proteinQty(p)], [c1, sideQty(c1)], [vs[i], 100], [vs[j], 80], ["Aceite de oliva", 10], ["Salsa de soja", 15]],
          ));
        }
      }
    }
  }

  // 4. Pasta / ñoquis con proteina y verdura
  for (const base of ok(["Pasta seca", "Gnocchi"])) {
    for (const p of ok(["Atun al aceite", "Jamon cocido", "Salchicha fresca", "Ricotta", "Mozzarella", "Scamorza", "Gambas", "Salmon"])) {
      for (const v of ok(["Tomate", "Champinones", "Espinaca", "Calabaza", "Morron", "Coliflor", "Zanahoria"])) {
        push("pasta", p, [base, v], mk(
          `${cap(label(base))} con ${label(p)} y ${label(v)}`,
          "dinner",
          20,
          "pasta",
          [
            sideStep(base === "Gnocchi" ? "Pasta seca" : base),
            `Saltea ${num(150)} g de ${label(v)} con ajo y aceite 6-8 minutos.`,
            `Suma ${label(p)} (${num(proteinQty(p))} g${p === "Mozzarella" || p === "Scamorza" || p === "Ricotta" ? ", al final para que se derrita" : ""}), sal y pimienta.`,
            `Mezcla con ${label(base)} escurrida.`,
          ],
          [[base, base === "Gnocchi" ? 200 : 100], [p, proteinQty(p)], [v, 150], ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 5. Arroz o cuscus con proteina y verdura
  for (const g of ok(["Arroz", "Cuscus"])) {
    for (const p of ok(["Pechuga de pollo", "Huevos", "Atun al aceite", "Gambas", "Salchicha fresca", "Jamon cocido"])) {
      for (const v of ok(["Tomate", "Morron", "Champinones", "Zanahoria", "Espinaca", "Judias verdes", "Cebolla"])) {
        push("arroz", p, [g, v], mk(
          `${cap(label(g))} con ${label(p)} y ${label(v)}`,
          "dinner",
          25,
          "arroz",
          [
            sideStep(g),
            p === "Huevos" ? "Hervi los huevos 9-10 minutos, enfrialos y cortalos." : `Cocina ${label(p)} (${num(proteinQty(p))} g) en una sarten con aceite.`,
            `Saltea ${label(v)} (150 g) con sal y pimienta unos minutos.`,
            `Mezcla ${label(g)} con la verdura y suma ${label(p)} al final.`,
          ],
          [[g, sideQty(g)], [p, proteinQty(p)], [v, 150], ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 6. Tortilla de verdura o papa
  if (c("Huevos")) {
    for (const base of ok(["Patata", "Calabaza", "Espinaca", "Champinones", "Coliflor", "Morron", "Zanahoria", "Judias verdes"])) {
      push("tortilla", "Huevos", [base], mk(
        `Tortilla de ${label(base)} y cebolla`,
        "dinner",
        25,
        "tortilla,huevo",
        [
          `Cocina ${label(base)} (${base === "Patata" ? "200" : "150"} g) y cebolla picada en la sarten con aceite hasta que esten tiernas.`,
          "Bate 3 huevos con sal y mezclalos con las verduras.",
          "Cuaja 3-4 minutos de cada lado.",
        ],
        [["Huevos", 3], [base, base === "Patata" ? 200 : 150], ["Cebolla", 40], ["Aceite de oliva", 12]],
      ));
      for (const ch of ok(["Scamorza", "Mozzarella", "Ricotta"])) {
        push("tortilla", "Huevos", [base, ch], mk(
          `Tortilla de ${label(base)} con ${label(ch)}`,
          "dinner",
          25,
          "tortilla,huevo",
          [
            `Cocina ${label(base)} (150 g) en la sarten con aceite hasta que este tierna.`,
            "Bate 3 huevos con sal, mezclalos y vuelcalos en la sarten.",
            `Agrega ${label(ch)} (40 g) por encima, cuaja y dobla la tortilla.`,
          ],
          [["Huevos", 3], [base, 150], [ch, 40], ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 7. Ensalada completa
  for (const p of ok(["Atun al aceite", "Huevos", ...LEGUME, "Mozzarella", "Jamon cocido", "Ricotta"])) {
    const vs = ok(SALAD_VEG);
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        push("ensalada", p, [vs[i], vs[j]], mk(
          `Ensalada de ${label(p)} con ${label(vs[i])} y ${label(vs[j])}`,
          "lunch",
          12,
          "ensalada,rapido",
          [
            p === "Huevos" ? "Hervi los huevos 9-10 minutos y cortalos." : LEGUME.includes(p) ? `Escurre y enjuaga ${label(p)}.` : `Prepara ${label(p)} en trozos.`,
            `Corta ${label(vs[i])} y ${label(vs[j])}.`,
            "Mezcla todo, aderezar con aceite, sal y pimienta y acompanar con pan.",
          ],
          [[p, proteinQty(p)], [vs[i], 120], [vs[j], 100], ...(c("Pan de molde") ? ([["Pan de molde", 50]] as [string, number][]) : []), ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 8. Guiso rapido de legumbres
  for (const l of ok(LEGUME)) {
    for (const v of ok(["Cebolla", "Zanahoria", "Tomate", "Espinaca", "Calabaza", "Apio"])) {
      for (const side of ok(["Arroz", "Patata"])) {
        push("legumbres", l, [v, side], mk(
          `Guiso rapido de ${label(l)} con ${label(v)} y ${label(side)}`,
          "dinner",
          25,
          "legumbres,economico",
          [
            `Sofrie cebolla y ${label(v)} (120 g) en aceite 6 minutos.`,
            `Agrega ${label(l)} escurridos (${num(proteinQty(l))} g) y un poco de agua o caldo, cocina 10 minutos.`,
            side === "Arroz" ? "Acompana con arroz hervido (50 g)." : "Suma papas en cubos (150 g) desde el principio para que se cocinen.",
          ],
          [[l, proteinQty(l)], [v, 120], [side, side === "Arroz" ? 50 : 150], ["Cebolla", 40], ["Aceite de oliva", 10]],
        ));
      }
    }
  }

  // 9. Sandwich
  for (const p of ok(["Jamon cocido", "Atun al aceite", "Mozzarella", "Pechuga de pollo", "Ricotta"])) {
    if (!c("Pan de molde")) break;
    for (const v of ok(["Tomate", "Lechuga", "Palta", "Espinaca"])) {
      push("sandwich", p, [v], mk(
        `Sandwich de ${label(p)} con ${label(v)}`,
        "lunch",
        10,
        "sandwich,rapido",
        [
          p === "Pechuga de pollo" ? "Usa pechuga ya cocida (a la plancha o al horno) y cortala en tiras." : `Prepara ${label(p)} en rodajas o desmenuzado.`,
          `Arma el sandwich con pan, ${label(p)} y ${label(v)} en rodajas.`,
          "Tostalo si queres.",
        ],
        [["Pan de molde", 100], [p, p === "Pechuga de pollo" ? 100 : proteinQty(p)], [v, 80]],
      ));
    }
  }

  // 10. Crema de verdura
  for (const v of ok(["Calabaza", "Zanahoria", "Coliflor", "Espinaca", "Judias verdes", "Apio", "Repollo"])) {
    if (!c("Patata") || !c("Huevos")) break;
    push("crema", null, [v], mk(
      `Crema de ${label(v)} con papas y huevo duro`,
      "dinner",
      30,
      "crema,economico",
      [
        `Hervi ${label(v)} (250 g) y papas (120 g) en cubos con agua y sal 15-20 minutos.`,
        "Procesa o tritura hasta lograr una crema y ajusta la sal.",
        "Hervi 2 huevos 9-10 minutos y sirvelos picados por encima.",
      ],
      [[v, 250], ["Patata", 120], ["Huevos", 2], ["Aceite de oliva", 8]],
    ));
  }

  // 11. Polenta
  for (const p of ok(["Salchicha fresca", "Ricotta", "Scamorza", "Champinones"])) {
    if (!c("Polenta")) break;
    push("polenta", p, [], mk(
      `Polenta con ${label(p)}`,
      "dinner",
      25,
      "polenta",
      [sideStep("Polenta"), `Dora ${label(p)} (${num(proteinQty(p))} g) con cebolla en una sarten.`, "Sirve la polenta con el salteado por encima."],
      [["Polenta", 80], [p, proteinQty(p)], ["Cebolla", 40], ["Aceite de oliva", 10]],
    ));
  }

  return out.filter((x) => x.recipe.items.every((it) => c(it.ingredient) || it.ingredient === "Aceite de oliva" || it.ingredient === "Salsa de soja"));
}

export function composeRecipes(input: ComposerInput): ComposedRecipe[] {
  const avoid = input.avoid;
  const okName = (n: string) => {
    if (!input.available.has(n)) return false;
    const low = n.toLowerCase();
    if (avoid.some((a) => a && (low.includes(a) || label(n).includes(a)))) return false;
    // Lo no basico solo entra si esta en oferta: asi el menu sigue lo que conviene comprar.
    return STAPLES.has(n) || input.deals.has(n);
  };
  const combos = build(okName);

  const score = (c: Combo): number => {
    let s = 0;
    const names = [c.protein, ...c.parts, ...c.recipe.items.map((i) => i.ingredient)].filter((x): x is string => !!x);
    for (const n of new Set(names)) {
      const d = input.deals.get(n);
      if (d !== undefined) s += 10 + Math.min(d, 60) + (PROTEINS.has(n) ? 20 : 0);
    }
    return s + jitter(input.seed, c.recipe.name) * 25;
  };

  const scored = combos
    .filter((c) => !input.existingNames.has(c.recipe.name.toLowerCase()))
    .map((c) => ({ c, s: score(c) }));

  const byTemplate = new Map<string, typeof scored>();
  for (const x of scored) byTemplate.set(x.c.template, [...(byTemplate.get(x.c.template) ?? []), x]);
  for (const list of byTemplate.values()) list.sort((a, b) => b.s - a.s);

  const total = input.total ?? 60;
  const maxPerProtein = input.maxPerProtein ?? 5;
  const maxPerTemplate = input.maxPerTemplate ?? 9;
  const perProtein = new Map<string, number>();
  const perTemplate = new Map<string, number>();
  const picked: ComposedRecipe[] = [];
  const names = new Set<string>();
  const cursors = new Map<string, number>();
  const templates = [...byTemplate.keys()].sort();

  let progress = true;
  while (picked.length < total && progress) {
    progress = false;
    for (const t of templates) {
      if (picked.length >= total) break;
      const list = byTemplate.get(t) ?? [];
      let i = cursors.get(t) ?? 0;
      while (i < list.length) {
        const { c } = list[i];
        i += 1;
        const key = c.recipe.name.toLowerCase();
        const pc = c.protein ? (perProtein.get(c.protein) ?? 0) : 0;
        if (names.has(key)) continue;
        if (c.protein && pc >= maxPerProtein) continue;
        if ((perTemplate.get(t) ?? 0) >= maxPerTemplate) break;
        names.add(key);
        if (c.protein) perProtein.set(c.protein, pc + 1);
        perTemplate.set(t, (perTemplate.get(t) ?? 0) + 1);
        picked.push(c.recipe);
        progress = true;
        break;
      }
      cursors.set(t, i);
    }
  }
  return picked;
}
