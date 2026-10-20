import type { BaseUnit } from "@/db/schema";
import type { ParsedOffer } from "./types";

/**
 * Reglas para ligar una oferta a un ingrediente de las recetas (por nombre canonico).
 * Son conservadoras a proposito: es mejor no ligar una oferta que ligarla mal.
 */
const RULES: { ingredient: string; re: RegExp; not?: RegExp }[] = [
  { ingredient: "Pechuga de pollo", re: /\b(petto di pollo|fesa di pollo|mini filetti di pollo)\b/i, not: /(forno|spiedo|panat|cotolett|rollè|kebab)/i },
  { ingredient: "Carne picada de vacuno", re: /\b(macinato|carne macinata|trita|polpa trita)\b/i },
  { ingredient: "Atun al aceite", re: /\btonno\b.*\b(olio|oliva)\b/i, not: /(filetti .* barattolo|insalata)/i },
  { ingredient: "Huevos", re: /\buova\b/i, not: /(pasqua|cioccolato)/i },
  { ingredient: "Jamon cocido", re: /\bprosciutto cotto\b/i },
  { ingredient: "Mozzarella", re: /^mozzarella\b/i, not: /(pizza|bufala)/i },
  { ingredient: "Yogur natural", re: /\byogurt\b.*\b(bianco|intero o zero grassi|naturale)\b/i },
  { ingredient: "Leche", re: /\blatte\b.*\b(uht|parzialmente scremato|intero)\b/i, not: /(crescita|avena|soia|riso|mandorla)/i },
  { ingredient: "Tomate", re: /\bpomodori\b/i, not: /(passata|polpa|pelati|secchi|sugo)/i },
  { ingredient: "Cebolla", re: /\bcipolle?\b/i, not: /(hamburger|burger)/i },
  { ingredient: "Patata", re: /^patate\b/i, not: /(fritte|surgel|purè|gnocchi|patatine)/i },
  { ingredient: "Morron", re: /\bpeperoni\b/i, not: /(peperoncino|sottoli)/i },
  { ingredient: "Champinones", re: /\bfunghi champignon\b/i },
  { ingredient: "Palta", re: /\bavocado\b/i },
  { ingredient: "Banana", re: /\bbanane\b/i },
  { ingredient: "Uvas", re: /^uva\b/i },
  { ingredient: "Pasta seca", re: /\b(pasta di semola|pasta di grano|spaghetti|penne|fusilli|rigatoni|maccheroni)\b/i, not: /(fresca|ripiena|all'uovo)/i },
  { ingredient: "Arroz", re: /^riso\b/i, not: /(express|cup|farina)/i },
  { ingredient: "Pan de molde", re: /\b(pan bauletto|pane (bianco|in cassetta|morbido))\b/i },
];

export function mapOfferToIngredient(offer: Pick<ParsedOffer, "name">): string | null {
  for (const r of RULES) {
    if (r.re.test(offer.name) && !(r.not && r.not.test(offer.name))) return r.ingredient;
  }
  return null;
}

export type ProductDraft = { packSize: number; packUnit: BaseUnit; soldByWeight: boolean };

/**
 * Datos de producto para el ingrediente, solo si la unidad de la oferta es compatible con la
 * unidad base del ingrediente (g, ml o unidades). Si no, devuelve null.
 */
export function toProductDraft(
  offer: Pick<ParsedOffer, "perKg" | "packSize" | "packUnit">,
  ingredientBase: BaseUnit,
): ProductDraft | null {
  if (offer.perKg) {
    return ingredientBase === "g" ? { packSize: 1000, packUnit: "g", soldByWeight: true } : null;
  }
  if (!offer.packSize || !offer.packUnit) return null;
  if (offer.packUnit !== ingredientBase) return null;
  return { packSize: offer.packSize, packUnit: ingredientBase, soldByWeight: false };
}
