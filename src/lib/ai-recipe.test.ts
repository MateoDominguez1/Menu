import { describe, expect, it } from "vitest";
import { buildDraftPrompt, parseRecipeDraft, type DraftIngredient } from "./ai-recipe";

const ings: DraftIngredient[] = [
  { id: 1, name: "Pan de molde", baseUnit: "g" },
  { id: 2, name: "Jamon cocido", baseUnit: "g" },
  { id: 3, name: "Mozzarella", baseUnit: "g" },
];

describe("parseRecipeDraft", () => {
  it("acepta un borrador valido aunque venga con texto alrededor", () => {
    const text = 'Aqui va:\n{"minutes":5,"instructions":"Arma el sandwich\\nTuestalo","items":[{"ingredientId":1,"quantity":80},{"ingredientId":2,"quantity":40}],"missing":["manteca"]}';
    expect(parseRecipeDraft(text, ings)).toEqual({
      minutes: 5,
      instructions: "Arma el sandwich\nTuestalo",
      items: [
        { ingredientId: 1, quantity: 80 },
        { ingredientId: 2, quantity: 40 },
      ],
      missing: ["manteca"],
    });
  });

  it("rechaza ids inexistentes, repetidos, cantidades invalidas y JSON roto", () => {
    const base = { minutes: 5, instructions: "x" };
    const body = (items: unknown) => JSON.stringify({ ...base, items });
    expect(parseRecipeDraft(body([{ ingredientId: 99, quantity: 10 }]), ings)).toBeNull();
    expect(parseRecipeDraft(body([{ ingredientId: 1, quantity: 10 }, { ingredientId: 1, quantity: 5 }]), ings)).toBeNull();
    expect(parseRecipeDraft(body([{ ingredientId: 1, quantity: -3 }]), ings)).toBeNull();
    expect(parseRecipeDraft(body([]), ings)).toBeNull();
    expect(parseRecipeDraft("no es json", ings)).toBeNull();
  });

  it("el prompt incluye el plato y el catalogo", () => {
    const p = buildDraftPrompt("Tostado de jamon y queso", ings);
    expect(p).toContain("Tostado de jamon y queso");
    expect(p).toContain('"Mozzarella"');
  });
});
