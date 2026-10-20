const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

export function formatEUR(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return eur.format(cents / 100);
}

/** Acepta "2,50", "2.50", "€2.50". Devuelve centimos o null si no es valido. */
export function parseEuros(input: string): number | null {
  const cleaned = input.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
