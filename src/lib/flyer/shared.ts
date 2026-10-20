import type { OfferCategory, TextItem } from "./types";

/** "9,99" o "€ 9,99" -> 999. Devuelve null si no es un importe. */
export function parseEuroCents(text: string): number | null {
  const m = text.replace(/\s/g, "").match(/^€?(\d{1,4}),(\d{2})$/);
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null;
}

export function findAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,4}),(\d{2})(?!\d)/g)) {
    out.push(parseInt(m[1], 10) * 100 + parseInt(m[2], 10));
  }
  return out;
}

export type PackInfo = { size: number; unit: "g" | "ml" | "unit"; multi: boolean } | null;

function toBase(value: number, unit: string): { size: number; unit: "g" | "ml" } {
  const u = unit.toLowerCase();
  if (u === "kg") return { size: value * 1000, unit: "g" };
  if (u === "g") return { size: value, unit: "g" };
  if (u === "l") return { size: value * 1000, unit: "ml" };
  if (u === "cl") return { size: value * 10, unit: "ml" };
  return { size: value, unit: "ml" };
}

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Lee el tamano del envase desde el nombre: "125 g x3", "2x125 g", "1 kg", "10 uova". */
export function parsePack(name: string): PackInfo {
  const text = name.replace(/\s+/g, " ");
  let m = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  if (m) {
    const base = toBase(num(m[2]), m[3]);
    return { size: base.size * parseInt(m[1], 10), unit: base.unit, multi: true };
  }
  m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\s*[x×]\s*(\d+)\b/i);
  if (m) {
    const base = toBase(num(m[1]), m[2]);
    return { size: base.size * parseInt(m[3], 10), unit: base.unit, multi: true };
  }
  m = text.match(/\b(\d+)\s+uova\b/i);
  if (m) return { size: parseInt(m[1], 10), unit: "unit", multi: false };
  m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
  if (m) {
    const base = toBase(num(m[1]), m[2]);
    return { size: base.size, unit: base.unit, multi: false };
  }
  return null;
}

/** Hay varias presentaciones ("180 g / 200 g", "da 40 g a 550 g"): el tamano exacto no es confiable. */
export function hasVariants(name: string): boolean {
  return /\d\s*(g|kg|ml|l|cl)?\s*\/\s*\d/i.test(name) || /\bda\s+\d+\s*(g|ml|kg|l)\s+a\s+\d/i.test(name) || /gusti assortiti|assortit/i.test(name);
}

const RULES: { cat: OfferCategory; re: RegExp }[] = [
  { cat: "congelados", re: /\b(surgelat\w*|gelato|gelati|ghiaccioli)\b/i },
  { cat: "snacks_dulces", re: /\b(patatine|snack|cioccolat\w*|caramelle|gomme da masticare|merendine|biscott\w*|wafer|barrette|tiramis\w*|torta|torte|crostatine|nachos?|popcorn|pan di stelle|abbracci|nascondini|tavoletta|pralin\w*|frollini|plumcake|panettone|pandoro|nutella|crema spalmabile|marmellata|miele)\b/i },
  { cat: "bebidas", re: /\b(acqua|birra|vino|prosecco|spumante|succo|succhi|bibita|cola|coca|aranciata|tisana|tisane|caffè|caffe|cappuccino|liquore|whisky|vodka|gin|rum|grappa|amaro|energy|bevanda|bevande|tonica|chinotto|sprite|fanta|spritz|aperol|campari|tè)\b/i },
  { cat: "conservas_despensa", re: /\b(tonno in|tonno al|filetti di tonno|filetti di sgombro|sgombro|acciughe|alici|olive|passata|polpa|pelati|sughi?|pesti?|fagioli|ceci|lenticchie|piselli|mais|olio|aceto|sale|zucchero|farina|semola|lievito|brodo|dado|maionese|ketchup|salse?|senape|cereali|polenta|conserva|sottoli|antipasto|hummus|purè|tonno)\b/i },
  { cat: "pescado", re: /\b(orata|platessa|totano|totani|seppia|gamber\w*|mazzancolle|salmone|merluzz\w*|cozze|vongol\w*|baccal\w*|pesce|persico|spada|trota|polpo|calamar\w*|branzino|code di|filetto di)\b/i },
  { cat: "pasta_arroz", re: /\b(pasta|spaghetti|penne|fusilli|rigatoni|riso|risotto|gnocchi|tagliatelle|pappardelle|lasagne|ravioli|tortellini|cous ?cous|orzo|cannelloni)\b/i },
  { cat: "pan_panaderia", re: /\b(pane|pan|bauletto|piadine?|grissini|crackers?|focaccia|brioche|cornett\w*|croissant|taralli|fette biscottate|tramezzini|pinsa|panpatata)\b/i },
  { cat: "fiambres_quesos", re: /\b(prosciutto|salame|salami|salamini|mortadella|bresaola|speck|pancetta|coppa|culatello|guanciale|bacon|wurstel|formaggi?o?|mozzarella|burrata|stracchino|stracciatella|gorgonzola|provola|provolone|pecorino|grana|parmigiano|taleggio|fontina|asiago|ricotta|riccotta|mascarpone|scamorza|emmentaler|toma|caprino|feta|philadelphia|sottilette|bergamino|fior di latte)\b/i },
  { cat: "lacteos_huevos", re: /\b(latte|yogurt|yogur|uova|burro|panna|kefir|skyr|budino|dessert|besciamella|margarina|danette|dolce)\b/i },
  { cat: "carne", re: /\b(pollo|tacchino|manzo|bovino|vitello|scottona|maiale|suino|salsiccia|salamella|hamburger|macinat\w*|trita|arrosto|bistecca|fettine?|cotolett\w*|costine|costata|tagliata|lonza|spezzatino|ossobuco|coniglio|agnello|fesa|petto|sovracosce|cosce|posteriori|alette|nuggets|polpette|spiedini|arrosticini|rollè|involtini|stinco|pulled|tartare|equino|cavallo|anatra|panati|kebab|bon roll|cotosnella|cotechino|zampone|brasato)\b/i },
  { cat: "fruta_verdura", re: /\b(mele|mela|pere|pera|banane|uva|arance|arancia|clementine|mandarini|limoni|kiwi|fragole|cachi|castagne|noci|nocciole|mandorle|pistacchi|verdur\w*|frutta|ananas|melone|anguria|pesche|albicocche|prugne|fichi|mirtilli|lamponi|cime di rapa|barbabietole|patate|pomodor\w*|cipoll\w*|carot\w*|zucchin\w*|peperon\w*|cavol\w*|broccol\w*|melanzan\w*|finocch\w*|insalat\w*|lattug\w*|lattughino|iceberg|rucola|spinaci|funghi|champignon|sedano|aglio|zucca|radicchio|carciof\w*|asparag\w*|porri|rape|bietol\w*|avocado|datterino|ciliegino|piccadilly)\b/i },
];

/** Devuelve la categoria de un alimento segun su nombre ("pasta gialla" de patatas no es pasta). */
export function categorize(name: string): OfferCategory {
  const text = name.replace(/pasta gialla/gi, "patate");
  // Gana la palabra que aparece primero en el nombre ("Yogurt ... fior di latte" es yogur, no queso).
  let best: { idx: number; cat: OfferCategory } | null = null;
  for (const r of RULES) {
    const m = r.re.exec(text);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, cat: r.cat };
  }
  return best ? best.cat : "otros_alimentos";
}

const NON_FOOD =
  /\b(carta igienica|shampoo|bagnoschiuma|detersiv|ammorbidente|lavatrice|lavastoviglie|deodorante|dentifricio|spazzolino|assorbenti|pannolini|rasoio|crema viso|sapone|detergente|pulizia|sgrassatore|candeggina|spugn|sacchi|pellicola|alluminio|carta casa|tovaglioli|fazzoletti|pile|batterie|lampadin|piumino|lenzuola|coperta|cuscino|pigiama|calze|slip|maglia|felpa|scarpe|zaino|valigia|trolley|tv|smartphone|cuffie|aspirapolvere|friggitrice|robot|padella|pentola|set |lettiera|crocchette|cibo per (cani|gatti)|alimento per (cani|gatti)|latte crescita|biberon|giocattol|lego|puzzle|libro)\b/i;

export function looksNonFood(name: string): boolean {
  return NON_FOOD.test(name);
}

/** Agrupa items en lineas por y y devuelve el texto de cada linea ordenado por x. */
export function lineText(items: TextItem[]): string {
  return items
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .filter(Boolean)
    .join(" ");
}

export function isUpper(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.length > 1 && letters === letters.toUpperCase();
}

/** Separa nombre y marca: la ultima linea en mayusculas y corta suele ser la marca. */
export function splitBrand(lines: string[]): { name: string; brand: string | null } {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length >= 2) {
    const last = clean[clean.length - 1];
    if (isUpper(last) && last.length <= 28 && !/\d/.test(last.replace(/[+&.\s]/g, "x").replace(/x/g, ""))) {
      return { name: clean.slice(0, -1).join(" "), brand: last };
    }
  }
  return { name: clean.join(" "), brand: null };
}
