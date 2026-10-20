import type { BaseUnit, Category, Slot } from "./schema";

export type SeedIngredient = {
  name: string;
  category: Category;
  baseUnit: BaseUnit;
  gramsPerUnit?: number;
  /** kcal, proteina, carbohidratos, grasa por 100 g (o 100 ml). Estimacion generica, no de etiqueta. */
  n?: [number, number, number, number];
};

export const NUTRITION_SOURCE =
  "Estimacion generica por 100 g/ml (no proviene de la etiqueta del producto). Verificar si se necesita precision.";

export const ingredients: SeedIngredient[] = [
  { name: "Pasta seca", category: "pasta_arroz_cereales", baseUnit: "g", n: [350, 12, 72, 1.5] },
  { name: "Arroz", category: "pasta_arroz_cereales", baseUnit: "g", n: [350, 7, 78, 0.6] },
  { name: "Pan de molde", category: "pasta_arroz_cereales", baseUnit: "g", n: [265, 8, 49, 3.5] },
  { name: "Pechuga de pollo", category: "carne_pescado", baseUnit: "g", n: [110, 23, 0, 1.5] },
  { name: "Carne picada de vacuno", category: "carne_pescado", baseUnit: "g", n: [215, 19, 0, 15] },
  { name: "Milanesa de cerdo", category: "carne_pescado", baseUnit: "g", n: [250, 18, 14, 14] },
  { name: "Atun al aceite", category: "conservas_secos", baseUnit: "g", n: [200, 25, 0, 11] },
  { name: "Huevos", category: "lacteos_huevos", baseUnit: "unit", gramsPerUnit: 60, n: [143, 12.6, 0.7, 9.5] },
  { name: "Jamon cocido", category: "lacteos_huevos", baseUnit: "g", n: [120, 19, 1, 4] },
  { name: "Mozzarella", category: "lacteos_huevos", baseUnit: "g", n: [240, 18, 1, 18] },
  { name: "Yogur natural", category: "lacteos_huevos", baseUnit: "g", n: [61, 3.5, 4.7, 3.3] },
  { name: "Leche", category: "lacteos_huevos", baseUnit: "ml", n: [47, 3.4, 4.8, 1.6] },
  { name: "Tomate", category: "fruta_verdura", baseUnit: "g", n: [18, 0.9, 3.9, 0.2] },
  { name: "Cebolla", category: "fruta_verdura", baseUnit: "g", n: [40, 1.1, 9, 0.1] },
  { name: "Patata", category: "fruta_verdura", baseUnit: "g", n: [77, 2, 17, 0.1] },
  { name: "Morron", category: "fruta_verdura", baseUnit: "g", n: [31, 1, 6, 0.3] },
  { name: "Champinones", category: "fruta_verdura", baseUnit: "g", n: [22, 3.1, 3.3, 0.3] },
  { name: "Palta", category: "fruta_verdura", baseUnit: "unit", gramsPerUnit: 140, n: [160, 2, 9, 15] },
  { name: "Banana", category: "fruta_verdura", baseUnit: "unit", gramsPerUnit: 120, n: [89, 1.1, 23, 0.3] },
  { name: "Uvas", category: "fruta_verdura", baseUnit: "g", n: [69, 0.7, 18, 0.2] },
  { name: "Aceite de oliva", category: "conservas_secos", baseUnit: "ml", n: [810, 0, 0, 91] },
  { name: "Salsa de soja", category: "conservas_secos", baseUnit: "ml", n: [53, 8, 5, 0.6] },
  { name: "Nutella", category: "conservas_secos", baseUnit: "g", n: [539, 6.3, 57.5, 30.9] },
];

export type SeedRecipe = {
  name: string;
  mealType: Slot;
  minutes: number;
  tags: string;
  instructions: string;
  items: [string, number][];
};

export const recipes: SeedRecipe[] = [
  {
    name: "Sandwich de jamon y queso",
    mealType: "breakfast",
    minutes: 5,
    tags: "rapido",
    instructions: "Arma el sandwich con el jamon y la mozzarella. Tostalo si queres.",
    items: [["Pan de molde", 60], ["Jamon cocido", 40], ["Mozzarella", 40]],
  },
  {
    name: "Pan con Nutella",
    mealType: "breakfast",
    minutes: 3,
    tags: "rapido",
    instructions: "Unta el pan con Nutella. Acompanalo con cafe con leche.",
    items: [["Pan de molde", 50], ["Nutella", 25], ["Leche", 150]],
  },
  {
    name: "Pasta con atun, tomate y ajo",
    mealType: "dinner",
    minutes: 15,
    tags: "pasta,economico,rapido",
    instructions:
      "1. Hervi la pasta en agua con sal.\n2. En una sarten con aceite, calenta ajo molido 1 minuto y agrega el tomate en cubos 4-5 minutos.\n3. Suma el atun escurrido, sal y pimienta.\n4. Mezcla con la pasta colada.",
    items: [["Pasta seca", 100], ["Atun al aceite", 60], ["Tomate", 150], ["Aceite de oliva", 10]],
  },
  {
    name: "Pasta a la bolognesa",
    mealType: "dinner",
    minutes: 30,
    tags: "pasta,carne",
    instructions:
      "1. Sofrie la cebolla picada en aceite.\n2. Agrega la carne picada hasta que no quede rosada.\n3. Suma el tomate en cubos y cocina 10 minutos.\n4. Mezcla con la pasta cocida.",
    items: [["Pasta seca", 100], ["Carne picada de vacuno", 100], ["Tomate", 150], ["Cebolla", 40], ["Aceite de oliva", 10]],
  },
  {
    name: "Picadillo de carne con papas",
    mealType: "dinner",
    minutes: 30,
    tags: "carne,una-sarten",
    instructions:
      "1. Cocina las papas en cubos en el microondas con un poco de agua hasta casi tiernas.\n2. Sofrie la cebolla, agrega la carne picada y cocina hasta que este lista.\n3. Suma las papas y el tomate y dora 5-8 minutos.",
    items: [["Carne picada de vacuno", 100], ["Patata", 250], ["Cebolla", 50], ["Tomate", 100], ["Aceite de oliva", 10]],
  },
  {
    name: "Tortilla de papa y cebolla",
    mealType: "dinner",
    minutes: 30,
    tags: "huevo,economico",
    instructions:
      "1. Cocina las papas en cubos y la cebolla en la sarten con aceite hasta que esten tiernas.\n2. Bate los huevos con sal y mezclalos con las papas.\n3. Cuaja 3-4 minutos de cada lado.",
    items: [["Huevos", 3], ["Patata", 200], ["Cebolla", 60], ["Aceite de oliva", 15]],
  },
  {
    name: "Arroz con pollo, morron y tomate",
    mealType: "dinner",
    minutes: 30,
    tags: "arroz,pollo",
    instructions:
      "1. Dora el pollo en cubos en una olla con aceite.\n2. Agrega morron y tomate y cocina 5 minutos.\n3. Suma el arroz y agua o caldo (el doble del volumen del arroz) y cocina tapado 15 minutos.",
    items: [["Arroz", 90], ["Pechuga de pollo", 150], ["Morron", 80], ["Tomate", 100], ["Aceite de oliva", 10]],
  },
  {
    name: "Pollo al horno con papas y cebolla",
    mealType: "dinner",
    minutes: 35,
    tags: "pollo,horno",
    instructions:
      "1. Precalenta el horno a 200 C.\n2. Pone las papas en cubos y la cebolla en gajos en una fuente con aceite, sal y pimienta.\n3. Agrega el pollo con ajo y un chorrito de aceite.\n4. Hornea 25-30 minutos.",
    items: [["Pechuga de pollo", 150], ["Patata", 250], ["Cebolla", 60], ["Aceite de oliva", 10]],
  },
  {
    name: "Arroz salteado con huevo duro, cebolla y morron",
    mealType: "dinner",
    minutes: 25,
    tags: "arroz,huevo",
    instructions:
      "1. Hervi los huevos 9-10 minutos y picalos.\n2. Saltea cebolla y morron en aceite.\n3. Suma el arroz cocido y un chorrito de salsa de soja.\n4. Agrega el huevo duro picado al final.",
    items: [["Arroz", 90], ["Huevos", 2], ["Cebolla", 50], ["Morron", 80], ["Salsa de soja", 15], ["Aceite de oliva", 10]],
  },
  {
    name: "Pasta con champinones, tomate y mozzarella",
    mealType: "dinner",
    minutes: 20,
    tags: "pasta,vegetariano",
    instructions:
      "1. Hervi la pasta.\n2. Saltea los champinones laminados, agrega el tomate y cocina 5 minutos.\n3. Mezcla con la pasta y la mozzarella en trocitos hasta que se derrita.",
    items: [["Pasta seca", 100], ["Champinones", 120], ["Tomate", 100], ["Mozzarella", 60]],
  },
  {
    name: "Pasta con jamon cocido, tomate y mozzarella",
    mealType: "dinner",
    minutes: 15,
    tags: "pasta,rapido",
    instructions:
      "1. Hervi la pasta.\n2. Ablanda el tomate en cubos 3-4 minutos con aceite, suma el jamon en tiras.\n3. Mezcla con la pasta y la mozzarella.",
    items: [["Pasta seca", 100], ["Jamon cocido", 40], ["Tomate", 150], ["Mozzarella", 60]],
  },
  {
    name: "Pasta con tomate, cebolla y mozzarella",
    mealType: "dinner",
    minutes: 20,
    tags: "pasta,economico,vegetariano",
    instructions:
      "1. Hervi la pasta.\n2. Sofrie la cebolla, suma el tomate y cocina 8 minutos.\n3. Mezcla con la pasta y la mozzarella.",
    items: [["Pasta seca", 100], ["Tomate", 150], ["Cebolla", 40], ["Mozzarella", 60]],
  },
  {
    name: "Arroz con huevo duro, tomate y cebolla",
    mealType: "dinner",
    minutes: 25,
    tags: "arroz,huevo,economico",
    instructions:
      "1. Hervi el arroz y, aparte, los huevos 9-10 minutos.\n2. Sofrie cebolla y tomate.\n3. Sirve el arroz con la salsa y los huevos duros cortados.",
    items: [["Arroz", 90], ["Huevos", 2], ["Tomate", 150], ["Cebolla", 40]],
  },
  {
    name: "Ensalada tibia de papas y atun",
    mealType: "dinner",
    minutes: 25,
    tags: "atun,papas",
    instructions:
      "1. Hervi las papas en cubos y escurrelas.\n2. Mezcla con atun escurrido, tomate, cebolla picada, aceite, sal y pimienta.",
    items: [["Patata", 250], ["Atun al aceite", 60], ["Tomate", 100], ["Cebolla", 40], ["Aceite de oliva", 10]],
  },
  {
    name: "Sandwich de pollo con palta y tomate",
    mealType: "lunch",
    minutes: 10,
    tags: "pollo,rapido",
    instructions:
      "1. Usa pollo ya cocido (a la plancha o al horno).\n2. Arma el sandwich con palta pisada, tomate en rodajas y el pollo.",
    items: [["Pan de molde", 80], ["Pechuga de pollo", 100], ["Palta", 0.5], ["Tomate", 80]],
  },
  {
    name: "Pollo a la plancha con papas y tomate",
    mealType: "lunch",
    minutes: 30,
    tags: "pollo",
    instructions:
      "1. Salpimenta el pollo y cocinalo a la plancha 5-6 minutos por lado.\n2. Hervi o hornea las papas en cubos.\n3. Sirve con tomate en rodajas y un chorrito de aceite.",
    items: [["Pechuga de pollo", 150], ["Patata", 250], ["Tomate", 100], ["Aceite de oliva", 10]],
  },
  {
    name: "Pollo salteado con champinones y morron + arroz",
    mealType: "lunch",
    minutes: 30,
    tags: "pollo,arroz",
    instructions:
      "1. Hervi el arroz.\n2. Saltea el pollo en tiras hasta dorar.\n3. Suma champinones y morron y cocina 6-8 minutos.\n4. Sirve sobre el arroz.",
    items: [["Pechuga de pollo", 150], ["Champinones", 100], ["Morron", 80], ["Arroz", 80], ["Aceite de oliva", 10]],
  },
  {
    name: "Milanesas de cerdo con papas",
    mealType: "dinner",
    minutes: 30,
    tags: "cerdo,horno,habitual",
    instructions:
      "1. Precalenta el horno a 200 C.\n2. Hornea las milanesas y las papas en cubos con aceite 20-25 minutos, dando vuelta a mitad.\n3. Sirve con tomate.",
    items: [["Milanesa de cerdo", 150], ["Patata", 250], ["Tomate", 100], ["Aceite de oliva", 10]],
  },
  {
    name: "Sandwich de huevo duro con jamon y tomate",
    mealType: "dinner",
    minutes: 15,
    tags: "huevo,rapido",
    instructions:
      "1. Hervi los huevos 9-10 minutos.\n2. Arma el sandwich con huevo en rodajas, jamon y tomate.",
    items: [["Pan de molde", 80], ["Huevos", 2], ["Jamon cocido", 40], ["Tomate", 80]],
  },
  {
    name: "Ensalada de atun con tomate, cebolla y palta",
    mealType: "lunch",
    minutes: 10,
    tags: "atun,rapido",
    instructions:
      "Mezcla el atun escurrido con tomate, cebolla picada y palta en cubos. Aderezar con aceite, sal y pimienta. Acompanar con pan.",
    items: [["Atun al aceite", 60], ["Tomate", 150], ["Cebolla", 40], ["Palta", 0.5], ["Pan de molde", 50], ["Aceite de oliva", 10]],
  },
  { name: "Yogur con banana", mealType: "snack", minutes: 3, tags: "snack", instructions: "Corta la banana sobre el yogur.", items: [["Yogur natural", 125], ["Banana", 1]] },
  { name: "Uvas", mealType: "snack", minutes: 1, tags: "snack,postre", instructions: "Lava y come.", items: [["Uvas", 150]] },
];

export type SeedProduct = {
  store: "esselunga" | "iper";
  ingredient: string;
  name: string;
  brand?: string;
  packSize: number;
  packUnit: BaseUnit;
  soldByWeight?: boolean;
  price: {
    cents: number;
    promoCents?: number;
    validUntil?: string;
    observedAt: string;
    sourceKind: "flyer" | "web" | "manual";
    sourceRef: string;
    isEstimate: boolean;
  };
};

const EST = "Estimacion del asistente: no verificada en Esselunga";

export const products: SeedProduct[] = [
  // Verificados en esta conversacion (fuente y fecha reales).
  {
    store: "esselunga", ingredient: "Pechuga de pollo", name: "Petto di pollo (al peso)", packSize: 1000, packUnit: "g", soldByWeight: true,
    price: { cents: 848, observedAt: "2026-08-13", sourceKind: "flyer", sourceRef: "Volantino Esselunga 13-26 ago 2026 (anteprimavolantino.it)", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Patata", name: "Patate di Bologna DOP (sfuse)", packSize: 1000, packUnit: "g", soldByWeight: true,
    price: { cents: 119, validUntil: "2026-10-21", observedAt: "2026-10-08", sourceKind: "flyer", sourceRef: "Volantino Esselunga 8-21 ott 2026 (tuttoesselunga.com)", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Carne picada de vacuno", name: "Naturama polpa trita scelta di scottona", brand: "Esselunga Naturama", packSize: 400, packUnit: "g",
    price: { cents: 699, promoCents: 519, validUntil: "2026-10-07", observedAt: "2026-09-24", sourceKind: "flyer", sourceRef: "Volantino 24 set-7 ott 2026 (promo); precio habitual aprox. segun historial de precios de terceros", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Huevos", name: "Smart uova fresche medie da allevamento a terra", brand: "Smart", packSize: 10, packUnit: "unit",
    price: { cents: 219, observedAt: "2025-08-01", sourceKind: "web", sourceRef: "anteprimavolantino.it (volantini jul-ago 2025): precio desactualizado", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Yogur natural", name: "Smart yogurt intero bianco 500 g", brand: "Smart", packSize: 500, packUnit: "g",
    price: { cents: 69, observedAt: "2025-09-01", sourceKind: "web", sourceRef: "ilfattoalimentare.it / Esselunga Smart: precio desactualizado", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Mozzarella", name: "Esselunga mozzarella 125 g", brand: "Esselunga", packSize: 125, packUnit: "g",
    price: { cents: 99, observedAt: "2026-10-20", sourceKind: "web", sourceRef: "miaspesa.it (tercero, sin confirmar)", isEstimate: false },
  },
  {
    store: "esselunga", ingredient: "Jamon cocido", name: "Smart prosciutto cotto alta qualita 130 g", brand: "Smart", packSize: 130, packUnit: "g",
    price: { cents: 168, observedAt: "2026-10-20", sourceKind: "web", sourceRef: "miaspesa.it (tercero, sin confirmar)", isEstimate: false },
  },
  // Iper La grande i: promos del volantino 12-25 oct 2026. Los volantinos varian por local y solo traen ofertas.
  {
    store: "iper", ingredient: "Patata", name: "Patate a pasta gialla 2,5 kg", packSize: 2500, packUnit: "g",
    price: { cents: 245, validUntil: "2026-10-25", observedAt: "2026-10-20", sourceKind: "flyer", sourceRef: "Volantino Iper La grande i 12-25 ott 2026 p.7 (PDF oficial): 0,98 EUR/kg, 2,45 EUR la bolsa; varia por local", isEstimate: false },
  },
  {
    store: "iper", ingredient: "Champinones", name: "Funghi champignon 1 kg", packSize: 1000, packUnit: "g",
    price: { cents: 249, validUntil: "2026-10-25", observedAt: "2026-10-20", sourceKind: "flyer", sourceRef: "Volantino Iper La grande i 12-25 ott 2026 p.7 (PDF oficial)", isEstimate: false },
  },
  {
    store: "iper", ingredient: "Uvas", name: "Uva bianca senza semi 1 kg", packSize: 1000, packUnit: "g",
    price: { cents: 259, validUntil: "2026-10-25", observedAt: "2026-10-20", sourceKind: "flyer", sourceRef: "Volantino Iper La grande i 12-25 ott 2026 p.7 (PDF oficial)", isEstimate: false },
  },
  // Estimaciones: se muestran marcadas como tales y se pueden confirmar desde la app.
  { store: "esselunga", ingredient: "Pasta seca", name: "Pasta 500 g", packSize: 500, packUnit: "g", price: { cents: 85, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Arroz", name: "Arroz 1 kg", packSize: 1000, packUnit: "g", price: { cents: 150, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Pan de molde", name: "Pane morbido 400 g", brand: "Esselunga", packSize: 400, packUnit: "g", price: { cents: 200, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Atun al aceite", name: "Tonno all'olio d'oliva 4 x 80 g", brand: "Esselunga", packSize: 320, packUnit: "g", price: { cents: 350, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Tomate", name: "Pomodori (sfusi)", packSize: 1000, packUnit: "g", soldByWeight: true, price: { cents: 399, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Cebolla", name: "Cipolle (1 kg)", packSize: 1000, packUnit: "g", price: { cents: 130, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Morron", name: "Peperone (sfuso)", packSize: 1000, packUnit: "g", soldByWeight: true, price: { cents: 400, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Champinones", name: "Champignon 250 g", packSize: 250, packUnit: "g", price: { cents: 180, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Palta", name: "Avocado (1 unidad)", packSize: 1, packUnit: "unit", price: { cents: 180, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Banana", name: "Banane (sfuse)", packSize: 8, packUnit: "unit", soldByWeight: true, price: { cents: 160, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Uvas", name: "Uva Italia 500 g", packSize: 500, packUnit: "g", price: { cents: 170, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
  { store: "esselunga", ingredient: "Leche", name: "Latte UHT parzialmente scremato 1 L", packSize: 1000, packUnit: "ml", price: { cents: 110, observedAt: "2026-10-20", sourceKind: "manual", sourceRef: EST, isEstimate: true } },
];

export const IPER_STORE = {
  name: "Iper La grande i",
  notes:
    "Cadena confirmada por el usuario. Sus volantinos solo traen promociones y varian por local; no hay API publica de precios. Carga precios a mano o por CSV.",
};

export const profileRules: { kind: "allergy" | "avoid" | "restriction" | "staple"; value: string }[] = [
  { kind: "avoid", value: "brocoli" },
  { kind: "avoid", value: "berenjena" },
  { kind: "avoid", value: "zucchini" },
  { kind: "avoid", value: "calabacin" },
  { kind: "staple", value: "Aceite de oliva" },
  { kind: "staple", value: "Salsa de soja" },
  { kind: "staple", value: "Nutella" },
];
