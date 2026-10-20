import { readFileSync } from "node:fs";
import { mapOfferToIngredient, toProductDraft } from "../src/lib/flyer/mapping";
import type { ParsedOffer } from "../src/lib/flyer/types";

const files = process.argv.slice(2);
const baseUnit: Record<string, "g" | "ml" | "unit"> = { Huevos: "unit", Leche: "ml" };
const byIng = new Map<string, string[]>();
let total = 0;
let linked = 0;
for (const f of files) {
  const offers = JSON.parse(readFileSync(f, "utf8")) as ParsedOffer[];
  for (const o of offers) {
    total += 1;
    const ing = mapOfferToIngredient(o);
    if (!ing) continue;
    const draft = toProductDraft(o, baseUnit[ing] ?? "g");
    if (!draft) continue;
    linked += 1;
    byIng.set(ing, [...(byIng.get(ing) ?? []), `${o.store}: ${o.name.slice(0, 60)} ${(o.priceCents / 100).toFixed(2)}${o.perKg ? "/kg" : ""}`]);
  }
}
console.log(`ligadas ${linked} de ${total}`);
for (const [k, v] of [...byIng.entries()].sort()) {
  console.log(`\n${k} (${v.length})`);
  for (const l of v.slice(0, 4)) console.log("   " + l);
}
