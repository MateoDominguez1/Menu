import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { formatEUR } from "@/lib/money";
import { loadCatalog } from "@/server/catalog";
import { getHistory } from "@/server/queries";

export default async function HistoryPage() {
  const [rows, data] = await Promise.all([getHistory(), loadCatalog()]);
  const favorites = [...data.favoriteIds].map((id) => data.recipes.get(id)).filter(Boolean);
  const discarded = [...data.discardedIds].map((id) => data.recipes.get(id)).filter(Boolean);

  const closed = rows.filter((r) => r.actualCents !== null);
  const avgActual = closed.length ? Math.round(closed.reduce((s, r) => s + (r.actualCents ?? 0), 0) / closed.length) : null;

  return (
    <>
      <PageHeader title="Historial" subtitle="Planes anteriores, gasto real y recetas favoritas" />

      {avgActual !== null && (
        <Card className="mb-4">
          <p className="text-sm text-stone-500">Gasto real promedio ({closed.length} compra(s) cerradas)</p>
          <p className="text-2xl font-bold">{formatEUR(avgActual)}</p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty>Todavia no hay planes.</Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const dev = r.actualCents === null ? null : r.actualCents - r.plan.budgetCents;
            return (
              <Card key={r.plan.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/plan?plan=${r.plan.id}`} className="font-semibold">
                    {r.plan.weekStart} · {r.plan.days} dias
                  </Link>
                  <Badge tone={r.list?.status === "done" ? "good" : "neutral"}>
                    {r.list?.status === "done" ? "Compra cerrada" : "Abierta"}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <dt className="text-[11px] text-stone-500">Presupuesto</dt>
                    <dd className="font-semibold">{formatEUR(r.plan.budgetCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone-500">Estimado</dt>
                    <dd className="font-semibold">{formatEUR(r.estimatedCents)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-stone-500">Real</dt>
                    <dd className="font-semibold">{r.actualCents === null ? "—" : formatEUR(r.actualCents)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-stone-500">
                  {r.boughtCount} de {r.itemCount} productos comprados
                  {dev !== null && ` · desvio vs presupuesto: ${dev > 0 ? "+" : ""}${formatEUR(dev)}`}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Recetas</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-stone-500">Favoritas</h3>
          {favorites.length === 0 ? (
            <p className="text-sm text-stone-400">Ninguna todavia</p>
          ) : (
            <ul className="text-sm">
              {favorites.map((r) => (
                <li key={r!.id}>
                  <Link href={`/recipes/${r!.id}`}>{r!.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-stone-500">Descartadas (no se vuelven a sugerir)</h3>
          {discarded.length === 0 ? (
            <p className="text-sm text-stone-400">Ninguna</p>
          ) : (
            <ul className="text-sm">
              {discarded.map((r) => (
                <li key={r!.id}>
                  <Link href={`/recipes/${r!.id}`}>{r!.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
