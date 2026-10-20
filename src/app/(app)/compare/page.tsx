import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { productLabel } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import { todayISO } from "@/lib/dates";
import { getActivePlan, getComparison } from "@/server/queries";

const PRICE_LABEL = { kg: "kg", L: "L", u: "u" } as const;

export default async function ComparePage() {
  const { plan } = await getActivePlan();
  if (!plan) {
    return (
      <>
        <PageHeader title="Esselunga vs Iper" />
        <Empty>Genera un plan para comparar la compra.</Empty>
      </>
    );
  }
  const { comparison, stores, data } = await getComparison(plan.id);
  const today = todayISO();

  const totalFor = (slug: string) => comparison.strategies.find((s) => s.strategy === `all:${slug}`);
  const split = comparison.strategies.find((s) => s.strategy === "split");
  const rec = comparison.recommended;

  const priceCount = new Map<number, number>();
  for (const p of data.products.values()) {
    const recs = data.catalog.pricesByProduct.get(p.id) ?? [];
    if (recs.length > 0) priceCount.set(p.storeId, (priceCount.get(p.storeId) ?? 0) + 1);
  }

  const fmtStrategy = (key: string) =>
    key === "split" ? "Dividir" : (stores.find((s) => key === `all:${s.slug}`)?.name ?? key);

  return (
    <>
      <PageHeader title="Esselunga vs Iper" subtitle={`Plan ${plan.weekStart} · datos a ${today}`} />

      <div className="grid gap-3 sm:grid-cols-3">
        {stores.map((st) => {
          const t = totalFor(st.slug);
          const isRec = rec?.strategy === `all:${st.slug}`;
          return (
            <Card key={st.id} className={isRec ? "!border-emerald-600" : ""}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Todo en {st.name}</h2>
                {isRec && <Badge tone="good">Recomendada</Badge>}
              </div>
              {t && t.pricedCount > 0 ? (
                <>
                  <p className="mt-2 text-2xl font-bold">{formatEUR(t.totalCents)}</p>
                  <p className="text-xs text-stone-500">
                    {priceCount.get(st.id) ?? 0} producto(s) con precio cargado
                    {t.imputedCount > 0 && ` · ${t.imputedCount} precio(s) tomados de otra tienda`}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold text-stone-400">Sin datos</p>
                  <p className="text-xs text-stone-500">No hay precios vigentes de esta tienda para tu lista.</p>
                </>
              )}
            </Card>
          );
        })}
        <Card className={rec?.strategy === "split" ? "!border-emerald-600" : ""}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Dividir</h2>
            {rec?.strategy === "split" && <Badge tone="good">Recomendada</Badge>}
          </div>
          <p className="mt-2 text-2xl font-bold">{split ? formatEUR(split.adjustedCents) : "—"}</p>
          <p className="text-xs text-stone-500">
            {split && split.storeIds.length > 1
              ? `${formatEUR(split.totalCents)} + ${formatEUR(split.overheadCents)} de desplazamiento y tiempo`
              : "Todo conviene en una sola tienda"}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        {rec ? (
          <p className="text-sm">
            <strong>Recomendacion: {fmtStrategy(rec.strategy)}</strong>
            {comparison.splitSavingsCents > 0 && rec.strategy !== "split" ? (
              <>
                {" "}
                Dividir ahorraria {formatEUR(comparison.splitSavingsCents)} en productos, pero no compensa el costo de ir a una segunda tienda ({formatEUR(data.profile.travelCostCents + data.profile.timePenaltyCents)}).
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-stone-500">No hay precios cargados para los productos de esta lista.</p>
        )}
        <p className="mt-2 text-xs text-stone-500">
          Los totales solo incluyen productos con precio vigente y no vencido. Costo de desplazamiento y tiempo configurables en{" "}
          <Link href="/settings" className="underline">
            Ajustes
          </Link>
          .
        </p>
      </Card>

      {stores.some((st) => (priceCount.get(st.id) ?? 0) === 0) && (
        <Card className="mt-4 !border-amber-300 bg-amber-50 text-sm dark:!border-amber-800 dark:bg-amber-950">
          {stores
            .filter((st) => (priceCount.get(st.id) ?? 0) === 0)
            .map((st) => st.name)
            .join(", ")}{" "}
          no tiene precios cargados, por eso no se puede comparar. Podes importarlos por CSV o cargarlos a mano en{" "}
          <Link href="/settings" className="underline">
            Ajustes
          </Link>
          .
        </Card>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Por producto</h2>
      <div className="flex flex-col gap-3">
        {comparison.lines.map((l) => (
          <Card key={l.item.key} className="!p-3">
            <div className="flex items-baseline justify-between">
              <p className="font-medium">{l.item.name}</p>
              <p className="text-xs text-stone-500">necesitas {formatQuantity(l.item.toBuyQty, data.ingredients.get(l.item.ingredientId ?? -1)?.baseUnit ?? "g")}</p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {stores.map((st) => {
                const opt = l.byStore.get(st.id) ?? null;
                const cheapest = l.cheapestStoreId === st.id;
                return (
                  <div
                    key={st.id}
                    className={`rounded-xl border p-2 text-sm ${
                      cheapest ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-stone-200 dark:border-stone-700"
                    }`}
                  >
                    <p className="text-xs font-semibold text-stone-500">{st.name}</p>
                    {opt ? (
                      <>
                        <p className="font-semibold">
                          {formatEUR(opt.totalCents)}{" "}
                          <span className="text-xs font-normal text-stone-500">
                            ({formatEUR(Math.round(opt.unitPrice.cents))}/{PRICE_LABEL[opt.unitPrice.label]})
                          </span>
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {productLabel(opt.product.brand, opt.product.name)} · {formatQuantity(opt.product.packSize, opt.product.packUnit)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {opt.resolved.isPromo && <Badge tone="info">Promo</Badge>}
                          {opt.resolved.record.confirmedByUser && <Badge tone="good">Confirmado</Badge>}
                          {opt.resolved.record.isEstimate && <Badge tone="warn">Estimado</Badge>}
                          {opt.resolved.freshness === "stale" && <Badge tone="warn">Desactualizado</Badge>}
                          <Badge>{opt.resolved.record.observedAt}</Badge>
                        </div>
                      </>
                    ) : (
                      <p className="text-stone-400">Sin precio vigente</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
        {comparison.lines.length === 0 && <Empty>La lista no tiene productos para comprar.</Empty>}
      </div>

      {comparison.unknownEverywhere.length > 0 && (
        <p className="mt-6 text-sm text-amber-700 dark:text-amber-400">
          Sin precio en ninguna tienda: {comparison.unknownEverywhere.map((i) => i.name).join(", ")}.
        </p>
      )}
    </>
  );
}
