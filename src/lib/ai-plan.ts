import { z } from "zod";
import type { Slot } from "@/db/schema";
import type { RecipeLite } from "./types";

export type AiRecipeInfo = {
  id: number;
  name: string;
  mealType: Slot;
  minutes: number;
  costCents: number;
  kcal: number;
  protein: number;
  ingredients: string[];
};

export type AiPlanRequest = {
  slots: { date: string; slot: Slot }[];
  recipes: AiRecipeInfo[];
  budgetCents: number;
  goal: string;
  avoid: string[];
  pantry: string[];
  maxMinutes: number;
  maxRepeats: number;
};

export function buildAiPrompt(req: AiPlanRequest): string {
  return [
    "Eres un planificador de comidas. Elige UNA receta del catalogo para cada comida pedida.",
    "Reglas: usa solo ids del catalogo; no repitas una receta mas de " + req.maxRepeats + " veces;",
    "prioriza reutilizar ingredientes entre recetas y usar lo que ya hay en casa; respeta el presupuesto aproximado;",
    "no inventes recetas ni datos nutricionales. Responde SOLO con JSON valido, sin texto extra, con la forma:",
    '{"picks":[{"date":"YYYY-MM-DD","slot":"lunch|dinner|breakfast|snack","recipeId":123}]}',
    "",
    `Objetivo: ${req.goal}`,
    `Presupuesto de compra del periodo: ${(req.budgetCents / 100).toFixed(2)} EUR`,
    `Tiempo maximo por comida: ${req.maxMinutes} min`,
    `Alimentos a evitar: ${req.avoid.join(", ") || "ninguno"}`,
    `En casa: ${req.pantry.join(", ") || "nada"}`,
    "",
    "Comidas a cubrir:",
    JSON.stringify(req.slots),
    "",
    "Catalogo de recetas (costo y nutricion por porcion, estimados):",
    JSON.stringify(req.recipes),
  ].join("\n");
}

const responseSchema = z.object({
  picks: z.array(
    z.object({
      date: z.string(),
      slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      recipeId: z.number().int(),
    }),
  ),
});

export type AiPick = { date: string; slot: Slot; recipeId: number };

function eligible(recipe: RecipeLite, slot: Slot): boolean {
  if (recipe.mealType === slot) return true;
  const main = (s: Slot) => s === "lunch" || s === "dinner";
  return main(recipe.mealType) && main(slot);
}

/**
 * Valida la respuesta del modelo. Devuelve null ante CUALQUIER inconsistencia
 * (JSON roto, ids inexistentes, comidas faltantes o repetidas, exceso de repeticiones),
 * para que la app caiga al motor local en lugar de usar un plan a medias.
 */
export function parseAiPlan(
  text: string,
  slots: { date: string; slot: Slot }[],
  recipes: Map<number, RecipeLite>,
  maxRepeats: number,
): AiPick[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return null;

  const byKey = new Map<string, AiPick>();
  const counts = new Map<number, number>();
  for (const p of parsed.data.picks) {
    const key = `${p.date}|${p.slot}`;
    if (byKey.has(key)) return null;
    const recipe = recipes.get(p.recipeId);
    if (!recipe || !eligible(recipe, p.slot)) return null;
    const n = (counts.get(p.recipeId) ?? 0) + 1;
    if (n > maxRepeats) return null;
    counts.set(p.recipeId, n);
    byKey.set(key, p);
  }
  const out: AiPick[] = [];
  for (const s of slots) {
    const pick = byKey.get(`${s.date}|${s.slot}`);
    if (!pick) return null;
    out.push(pick);
  }
  return out;
}
