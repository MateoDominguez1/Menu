"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, btnPrimary, btnSecondary, input } from "@/components/ui";
import { formatEUR } from "@/lib/money";
import { addOfferToListAction } from "@/server/offer-actions";

export type OfferRow = {
  id: number;
  storeName: string;
  name: string;
  brand: string | null;
  category: string;
  priceCents: number;
  regularCents: number | null;
  discountPct: number | null;
  unitPriceCents: number | null;
  unitPriceLabel: "kg" | "L" | null;
  perKg: boolean;
  needsCard: boolean;
  condition: string | null;
  validUntil: string;
  linked: boolean;
};

const CAT_LABEL: Record<string, string> = {
  carne: "Carne",
  pescado: "Pescado",
  fiambres_quesos: "Fiambres y quesos",
  lacteos_huevos: "Lacteos y huevos",
  fruta_verdura: "Fruta y verdura",
  pan_panaderia: "Pan",
  pasta_arroz: "Pasta y arroz",
  conservas_despensa: "Despensa",
  congelados: "Congelados",
  bebidas: "Bebidas",
  snacks_dulces: "Snacks y dulces",
  otros_alimentos: "Otros",
};

type Sort = "descuento" | "precio_kg" | "precio" | "nombre";

export function OffersBrowser({ offers }: { offers: OfferRow[] }) {
  const [q, setQ] = useState("");
  const [store, setStore] = useState("todas");
  const [cat, setCat] = useState("todas");
  const [noCard, setNoCard] = useState(false);
  const [sort, setSort] = useState<Sort>("descuento");
  const [limit, setLimit] = useState(60);
  const [added, setAdded] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const stores = useMemo(() => [...new Set(offers.map((o) => o.storeName))], [offers]);
  const cats = useMemo(() => [...new Set(offers.map((o) => o.category))], [offers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = offers.filter(
      (o) =>
        (store === "todas" || o.storeName === store) &&
        (cat === "todas" || o.category === cat) &&
        (!noCard || !o.needsCard) &&
        (term === "" || `${o.name} ${o.brand ?? ""}`.toLowerCase().includes(term)),
    );
    const unit = (o: OfferRow) => o.unitPriceCents ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => {
      if (sort === "nombre") return a.name.localeCompare(b.name, "it");
      if (sort === "precio") return a.priceCents - b.priceCents;
      if (sort === "precio_kg") return unit(a) - unit(b);
      return (b.discountPct ?? -1) - (a.discountPct ?? -1);
    });
  }, [offers, q, store, cat, noCard, sort]);

  const add = (o: OfferRow) =>
    start(async () => {
      setError(null);
      try {
        await addOfferToListAction({ offerId: o.id, quantity: o.perKg ? 500 : 1 });
        setAdded((a) => ({ ...a, [o.id]: o.perKg ? "500 g" : "1 u" }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar");
      }
    });

  return (
    <section className="mt-6">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className={input} placeholder="Buscar (pollo, pasta, uova...)" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} />
        <select className={input} value={store} onChange={(e) => setStore(e.target.value)} aria-label="Tienda">
          <option value="todas">Todas las tiendas</option>
          {stores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={input} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Orden">
          <option value="descuento">Mayor descuento</option>
          <option value="precio_kg">Menor precio por kg/L</option>
          <option value="precio">Menor precio</option>
          <option value="nombre">Nombre</option>
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {["todas", ...cats].map((c) => (
          <button
            key={c}
            onClick={() => { setCat(c); setLimit(60); }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              cat === c
                ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-400"
            }`}
          >
            {c === "todas" ? "Todas" : (CAT_LABEL[c] ?? c)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-stone-500">
          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={noCard} onChange={(e) => setNoCard(e.target.checked)} />
          Solo sin tarjeta
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-stone-500">{filtered.length} resultado(s)</p>

      <ul className="mt-2 flex flex-col gap-2">
        {filtered.slice(0, limit).map((o) => (
          <li key={o.id} className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{o.name}</p>
                <p className="text-xs text-stone-500">
                  {o.storeName}
                  {o.brand ? ` · ${o.brand}` : ""} · hasta {o.validUntil}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{CAT_LABEL[o.category] ?? o.category}</Badge>
                  {o.needsCard && <Badge tone="warn">Requiere tarjeta</Badge>}
                  {o.linked && <Badge tone="good">Usable en recetas</Badge>}
                  {o.condition && !o.needsCard && <Badge tone="info">{o.condition.slice(0, 60)}</Badge>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold">
                  {formatEUR(o.priceCents)}
                  {o.perKg && <span className="text-xs font-normal text-stone-500"> /kg</span>}
                </p>
                {o.regularCents !== null && (
                  <p className="text-xs text-stone-500">
                    <s>{formatEUR(o.regularCents)}</s> {o.discountPct !== null && <span className="font-medium text-emerald-700 dark:text-emerald-400">-{o.discountPct}%</span>}
                  </p>
                )}
                {!o.perKg && o.unitPriceCents !== null && (
                  <p className="text-xs text-stone-500">
                    {formatEUR(o.unitPriceCents)}/{o.unitPriceLabel}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-2">
              {added[o.id] ? (
                <span className="text-sm text-emerald-700 dark:text-emerald-400">En la lista ({added[o.id]})</span>
              ) : (
                <button className={btnSecondary} disabled={pending} onClick={() => add(o)}>
                  + A la lista {o.perKg ? "(500 g)" : ""}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {filtered.length > limit && (
        <div className="mt-4 text-center">
          <button className={btnPrimary} onClick={() => setLimit((l) => l + 60)}>
            Ver mas ({filtered.length - limit} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
