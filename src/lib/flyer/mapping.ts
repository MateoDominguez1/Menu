import type { BaseUnit } from "@/db/schema";
import type { ParsedOffer } from "./types";

/**
 * Reglas para ligar una oferta a un ingrediente de las recetas (por nombre canonico).
 * Son conservadoras a proposito: es mejor no ligar una oferta que ligarla mal.
 */
const RULES: { ingredient: string; re: RegExp; not?: RegExp }[] = [
  { ingredient: "Pechuga de pollo", re: /\b(petto di pollo|fesa di pollo|mini filetti di pollo)\b/i, not: /(forno|spiedo|panat|cotolett|rollè|kebab)/i },
  { ingredient: "Carne picada de vacuno", re: /\b(carne macinata|macinato (di )?(bovino|manzo|vitello|scottona|misto)|polpa trita|trita di)\b/i },
  { ingredient: "Atun al aceite", re: /\btonno\b.*\b(olio|oliva)\b/i, not: /(filetti .* barattolo|insalata)/i },
  { ingredient: "Huevos", re: /\buova\b/i, not: /(pasqua|cioccolato)/i },
  { ingredient: "Jamon cocido", re: /\bprosciutto cotto\b/i },
  { ingredient: "Mozzarella", re: /^mozzarella\b/i, not: /(pizza|bufala)/i },
  { ingredient: "Yogur natural", re: /\byogurt\b.*\b(bianco|intero o zero grassi|naturale)\b/i },
  { ingredient: "Leche", re: /\blatte\b.*\b(uht|parzialmente scremato|intero)\b/i, not: /(crescita|avena|soia|riso|mandorla)/i },
  { ingredient: "Tomate", re: /\bpomodori\b/i, not: /(passata|polpa|pelati|secchi|sugo)/i },
  { ingredient: "Cebolla", re: /\bcipolle?\b/i, not: /(hamburger|burger)/i },
  { ingredient: "Patata", re: /^patate\b/i, not: /(fritte|surgel|purè|gnocchi|patatine)/i },
  { ingredient: "Morron", re: /^peperoni\b/i, not: /(peperoncino|sottoli)/i },
  { ingredient: "Champinones", re: /\bfunghi champignon\b/i },
  { ingredient: "Palta", re: /\bavocado\b/i },
  { ingredient: "Banana", re: /\bbanane\b/i },
  { ingredient: "Uvas", re: /^uva\b/i },
  { ingredient: "Pasta seca", re: /\b(pasta di semola|pasta di grano|spaghetti|penne|fusilli|rigatoni|maccheroni)\b/i, not: /(fresca|ripiena|all'uovo)/i },
  { ingredient: "Arroz", re: /^riso\b/i, not: /(express|cup|farina)/i },
  { ingredient: "Pan de molde", re: /\b(pan bauletto|pane (bianco|in cassetta|morbido))\b/i },
  { ingredient: "Pollo muslo", re: /\b(sovracosce|sottocosce|fuselli|posteriori|quarto posteriore|cosce)\b.*\bpollo\b|\bpollo\b.*\b(sovracosce|cosce|posteriori)\b/i, not: /(spiedo|panat|alette)/i },
  { ingredient: "Pavo", re: /\btacchino\b/i, not: /(hamburger|wurstel|cotto|affettat|prosciutto|petto al forno|arrosticini|salame|ossobuco)/i },
  { ingredient: "Cerdo magro", re: /\b(lonza di suino|fesa di suino|arrosto di (suino|maiale)|carr[eè])\b/i },
  { ingredient: "Salchicha fresca", re: /^(salsiccia|salamella)\b/i },
  { ingredient: "Hamburguesa de vacuno", re: /\bhamburger\b.*\b(bovino|scottona|vitello|manzo|piemontese)\b|\b(bovino|scottona|vitello|manzo)\b.*\bhamburger\b/i, not: /(pollo|tacchino|equino|bio.*equino)/i },
  { ingredient: "Ternera", re: /\b(fettine|fesa|scaloppine|spezzatino|arrosto)\b.*\b(vitello|bovino|manzo)\b|\b(vitello|bovino|manzo)\b.*\b(fettine|fesa|scaloppine|spezzatino)\b/i, not: /(tartare|hamburger|brasato|ossobuco)/i },
  { ingredient: "Pescado blanco", re: /\b(platessa|merluzzo|nasello|persico|cernia|halibut)\b/i, not: /(baccal|stoccafisso|croccole|fiori di merluzzo|bastoncini|panat)/i },
  { ingredient: "Dorada", re: /\borata\b/i },
  { ingredient: "Salmon", re: /^salmone\b/i, not: /(affumicat|sott|conserva|sushi)/i },
  { ingredient: "Gambas", re: /\b(gamber\w*|mazzancolle)\b/i, not: /(spiedini|code di)/i },
  { ingredient: "Ricotta", re: /\bricc?otta\b/i },
  { ingredient: "Scamorza", re: /^scamorza\b/i },
  { ingredient: "Queso rallado", re: /\bgrattugiat\w*\b.*\b(grana|parmigiano|formaggio)\b|\b(grana|parmigiano)\b.*\bgrattugiat\w*\b/i },
  { ingredient: "Garbanzos", re: /\bceci\b/i, not: /(pizza|pizzone|surgel|zuppa|minestra|hummus|pasta)/i },
  { ingredient: "Frijoles", re: /\bfagioli\b/i, not: /(piselli|pizza|pizzone|surgel|zuppa|minestra|salsiccia|pasta)/i },
  { ingredient: "Lentejas", re: /\blenticchie\b/i, not: /(pizza|surgel|zuppa|minestra)/i },
  { ingredient: "Guisantes", re: /\bpiselli\b/i },
  { ingredient: "Gnocchi", re: /\bgnocchi\b/i, not: /(ripien|farcit)/i },
  { ingredient: "Polenta", re: /^polenta\b/i },
  { ingredient: "Cuscus", re: /\bcous ?cous\b/i },
  { ingredient: "Zanahoria", re: /\bcarote\b/i },
  { ingredient: "Calabaza", re: /\bzucca\b/i, not: /(zucchero|risotto)/i },
  { ingredient: "Espinaca", re: /\bspinaci\b/i, not: /(ricotta|bon roll|surgel)/i },
  { ingredient: "Lechuga", re: /\b(lattuga|lattughino|iceberg|insalata mista)\b/i },
  { ingredient: "Hinojo", re: /\bfinocchi\b/i },
  { ingredient: "Coliflor", re: /\bcavolfiore\b/i },
  { ingredient: "Repollo", re: /\bcavolo\b/i },
  { ingredient: "Judias verdes", re: /\bfagiolini\b/i },
  { ingredient: "Apio", re: /\bsedano\b/i },
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
