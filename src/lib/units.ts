import type { BaseUnit } from "@/db/schema";

const ALIASES: Record<string, "g" | "kg" | "ml" | "l" | "unit"> = {
  g: "g",
  gr: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  lt: "l",
  u: "unit",
  un: "unit",
  unit: "unit",
  pz: "unit",
  ud: "unit",
};

export type IngredientUnitInfo = {
  baseUnit: BaseUnit;
  gramsPerUnit?: number | null;
};

export function normalizeUnitName(unit: string): "g" | "kg" | "ml" | "l" | "unit" {
  const key = unit.trim().toLowerCase();
  const found = ALIASES[key];
  if (!found) throw new Error(`Unidad no reconocida: "${unit}"`);
  return found;
}

/** Convierte una cantidad expresada en cualquier unidad soportada a la unidad base del ingrediente. */
export function toBaseQuantity(
  quantity: number,
  unit: string,
  ingredient: IngredientUnitInfo,
): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("La cantidad debe ser un numero mayor o igual a cero");
  }
  const u = normalizeUnitName(unit);
  const base = ingredient.baseUnit;
  const gpu = ingredient.gramsPerUnit ?? null;

  let inG: number | null = null;
  let inMl: number | null = null;
  let inUnit: number | null = null;
  if (u === "g") inG = quantity;
  else if (u === "kg") inG = quantity * 1000;
  else if (u === "ml") inMl = quantity;
  else if (u === "l") inMl = quantity * 1000;
  else inUnit = quantity;

  if (base === "g") {
    if (inG !== null) return inG;
    if (inUnit !== null && gpu) return inUnit * gpu;
  } else if (base === "ml") {
    if (inMl !== null) return inMl;
  } else {
    if (inUnit !== null) return inUnit;
    if (inG !== null && gpu) return inG / gpu;
  }
  throw new Error(
    `No se puede convertir ${quantity} ${unit} a ${base} para este ingrediente`,
  );
}

const nf = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function formatQuantity(quantity: number, unit: BaseUnit): string {
  if (unit === "unit") {
    const rounded = Math.round(quantity * 10) / 10;
    return `${nf.format(rounded)} u`;
  }
  if (quantity >= 1000) {
    return `${nf.format(quantity / 1000)} ${unit === "g" ? "kg" : "L"}`;
  }
  return `${nf.format(Math.round(quantity))} ${unit}`;
}

export function unitLabel(unit: BaseUnit): string {
  return unit === "unit" ? "u" : unit;
}
