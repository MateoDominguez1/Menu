import { z } from "zod";

export type DraftIngredient = { id: number; name: string; baseUnit: "g" | "ml" | "unit" };

export type RecipeDraft = {
  minutes: number;
  instructions: string;
  items: { ingredientId: number; quantity: number }[];
  /** Ingredientes que el plato necesita pero no existen en el catalogo. */
  missing: string[];
};

export function buildDraftPrompt(dish: string, ingredients: DraftIngredient[]): string {
  return [
    "Eres un cocinero practico. Arma una receta casera simple para UNA persona del plato pedido.",
    "Usa SOLO ingredientes del catalogo (por su id). Si el plato necesita algo que no esta en el catalogo,",
    'listalo en "missing" en vez de inventar un id. Cantidades en la unidad base del ingrediente (g, ml o unit).',
    "Preparacion: pasos cortos, un paso por linea, sin numerar. No des datos nutricionales.",
    "Responde SOLO con JSON valido, sin texto extra, con la forma:",
    '{"minutes":15,"instructions":"paso 1\\npaso 2","items":[{"ingredientId":1,"quantity":100}],"missing":["ajo"]}',
    "",
    `Plato: ${dish}`,
    "",
    "Catalogo de ingredientes:",
    JSON.stringify(ingredients),
  ].join("\n");
}

const draftSchema = z.object({
  minutes: z.number().min(1).max(600),
  instructions: z.string().min(1).max(3000),
  items: z.array(z.object({ ingredientId: z.number().int(), quantity: z.number().positive().max(5000) })).min(1).max(40),
  missing: z.array(z.string().max(60)).max(20).default([]),
});

/** Valida la respuesta del modelo. Devuelve null ante cualquier inconsistencia (JSON roto, ids inexistentes o repetidos). */
export function parseRecipeDraft(text: string, ingredients: DraftIngredient[]): RecipeDraft | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = draftSchema.safeParse(json);
  if (!parsed.success) return null;
  const known = new Set(ingredients.map((i) => i.id));
  const seen = new Set<number>();
  for (const it of parsed.data.items) {
    if (!known.has(it.ingredientId) || seen.has(it.ingredientId)) return null;
    seen.add(it.ingredientId);
  }
  return {
    minutes: Math.round(parsed.data.minutes),
    instructions: parsed.data.instructions,
    items: parsed.data.items,
    missing: parsed.data.missing,
  };
}
