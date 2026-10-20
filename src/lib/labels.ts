/** Evita "Smart Smart uova..." cuando el nombre del producto ya empieza con la marca. */
export function productLabel(brand: string | null, name: string): string {
  if (!brand) return name;
  return name.toLowerCase().startsWith(brand.toLowerCase()) ? name : `${brand} ${name}`;
}
