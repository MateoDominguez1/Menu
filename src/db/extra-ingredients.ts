import type { SeedIngredient } from "./seed-data";

/**
 * Ingredientes adicionales para que las ofertas de los volantinos se puedan usar en recetas.
 * Valores nutricionales por 100 g/ml: estimaciones genericas, no de etiqueta.
 */
export const extraIngredients: SeedIngredient[] = [
  // Proteinas
  { name: "Pollo muslo", category: "carne_pescado", baseUnit: "g", n: [190, 17, 0, 13] },
  { name: "Pavo", category: "carne_pescado", baseUnit: "g", n: [110, 23, 0, 1.5] },
  { name: "Cerdo magro", category: "carne_pescado", baseUnit: "g", n: [140, 22, 0, 5] },
  { name: "Salchicha fresca", category: "carne_pescado", baseUnit: "g", n: [300, 15, 1, 26] },
  { name: "Hamburguesa de vacuno", category: "carne_pescado", baseUnit: "g", n: [230, 17, 1, 17] },
  { name: "Ternera", category: "carne_pescado", baseUnit: "g", n: [110, 21, 0, 3] },
  { name: "Pescado blanco", category: "carne_pescado", baseUnit: "g", n: [85, 18, 0, 1] },
  { name: "Dorada", category: "carne_pescado", baseUnit: "g", n: [120, 20, 0, 4] },
  { name: "Salmon", category: "carne_pescado", baseUnit: "g", n: [200, 20, 0, 13] },
  { name: "Gambas", category: "carne_pescado", baseUnit: "g", n: [90, 18, 1, 1.5] },
  { name: "Ricotta", category: "lacteos_huevos", baseUnit: "g", n: [150, 8, 3, 12] },
  { name: "Scamorza", category: "lacteos_huevos", baseUnit: "g", n: [330, 25, 1, 25] },
  { name: "Queso rallado", category: "lacteos_huevos", baseUnit: "g", n: [400, 33, 0, 29] },
  // Legumbres
  { name: "Garbanzos", category: "conservas_secos", baseUnit: "g", n: [120, 7, 17, 2.5] },
  { name: "Frijoles", category: "conservas_secos", baseUnit: "g", n: [90, 6, 14, 0.5] },
  { name: "Lentejas", category: "conservas_secos", baseUnit: "g", n: [115, 9, 17, 0.5] },
  { name: "Guisantes", category: "conservas_secos", baseUnit: "g", n: [80, 5, 14, 0.4] },
  // Carbohidratos
  { name: "Gnocchi", category: "pasta_arroz_cereales", baseUnit: "g", n: [150, 3, 33, 0.5] },
  { name: "Polenta", category: "pasta_arroz_cereales", baseUnit: "g", n: [350, 8, 77, 1] },
  { name: "Cuscus", category: "pasta_arroz_cereales", baseUnit: "g", n: [360, 13, 73, 1.5] },
  // Verduras
  { name: "Zanahoria", category: "fruta_verdura", baseUnit: "g", n: [41, 0.9, 10, 0.2] },
  { name: "Calabaza", category: "fruta_verdura", baseUnit: "g", n: [26, 1, 6.5, 0.1] },
  { name: "Espinaca", category: "fruta_verdura", baseUnit: "g", n: [23, 2.9, 3.6, 0.4] },
  { name: "Lechuga", category: "fruta_verdura", baseUnit: "g", n: [15, 1.4, 2.9, 0.2] },
  { name: "Hinojo", category: "fruta_verdura", baseUnit: "g", n: [31, 1.2, 7, 0.2] },
  { name: "Coliflor", category: "fruta_verdura", baseUnit: "g", n: [25, 1.9, 5, 0.3] },
  { name: "Repollo", category: "fruta_verdura", baseUnit: "g", n: [25, 1.3, 6, 0.1] },
  { name: "Judias verdes", category: "fruta_verdura", baseUnit: "g", n: [31, 1.8, 7, 0.2] },
  { name: "Apio", category: "fruta_verdura", baseUnit: "g", n: [16, 0.7, 3, 0.2] },
];
