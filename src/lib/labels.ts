/** Evita "Smart Smart uova..." cuando el nombre del producto ya empieza o termina con la marca. */
export function productLabel(brand: string | null, name: string): string {
  if (!brand) return name;
  const lower = name.toLowerCase();
  const b = brand.toLowerCase();
  if (lower.startsWith(b)) return name;
  if (lower.endsWith(`(${b})`)) return `${brand} ${name.slice(0, name.length - b.length - 2).trim()}`;
  return `${brand} ${name}`;
}
