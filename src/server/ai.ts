import { buildAiPrompt, parseAiPlan, type AiPick, type AiPlanRequest } from "@/lib/ai-plan";
import { buildDraftPrompt, parseRecipeDraft, type DraftIngredient, type RecipeDraft } from "@/lib/ai-recipe";
import type { RecipeLite } from "@/lib/types";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Pide al modelo un borrador de receta para un plato. Devuelve null si no hay clave o la respuesta no es confiable. */
export async function aiDraftRecipe(dish: string, ingredients: DraftIngredient[]): Promise<RecipeDraft | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: buildDraftPrompt(dish, ingredients) }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return parseRecipeDraft(body.content?.find((c) => c.type === "text")?.text ?? "", ingredients);
  } catch {
    return null;
  }
}

/** Pide al modelo elegir recetas del catalogo. Devuelve null si no hay clave o la respuesta no es confiable. */
export async function aiPickRecipes(
  req: AiPlanRequest,
  recipes: Map<number, RecipeLite>,
): Promise<AiPick[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-5-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: buildAiPrompt(req) }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    return parseAiPlan(text, req.slots, recipes, req.maxRepeats);
  } catch {
    return null;
  }
}
