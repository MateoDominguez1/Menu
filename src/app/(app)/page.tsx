import Link from "next/link";
import { Badge, Card, Empty, PageHeader, ProgressBar, SLOT_LABEL, SKIP_LABEL, btnPrimary, btnSecondary } from "@/components/ui";
import { formatDay, todayISO } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { getActivePlan, getComparison, getListView, getTodayMeals, listTotals } from "@/server/queries";
import { loadCatalog } from "@/server/catalog";

export default async function Dashboard() {
  const { plan } = await getActivePlan();
  const data = await loadCatalog();
  const today = todayISO();

  if (!plan) {
    return (
      <>
        <PageHeader title="Inicio" subtitle={formatDay(today)} />
        <Empty>
          Todavia no tenes un plan. <br />
          <Link href="/plan" className={`${btnPrimary} mt-4`}>
            Generar mi primer plan
          </Link>
        </Empty>
      </>
    );
  }

  const [{ items }, meals, cmp] = await Promise.all([
    getListView(plan.id),
    getTodayMeals(plan.id, data),
    getComparison(plan.id),
  ]);
  const totals = listTotals(items);
  const budget = plan.budgetCents;
  const pct = budget > 0 ? Math.round((totals.estimatedCents / budget) * 100) : 0;
  const rec = cmp.comparison.recommended;
  const recName =
    rec === null
      ? null
      : rec.strategy === "split"
        ? "Dividir entre tiendas"
        : (cmp.stores.find((st) => rec.strategy === `all:${st.slug}`)?.name ?? null);
  const pantryCount = data.pantry.filter((p) => p.quantity > 0).length;

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={formatDay(today)}
        actions={
          <div className="flex gap-2">
            <Link href="/plan" className={btnSecondary}>
              Nuevo plan
            </Link>
            <Link href="/shopping" className={btnPrimary}>
              Lista de compras
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-stone-500">Presupuesto semanal</h2>
            <Badge tone={totals.estimatedCents > budget ? "bad" : "good"}>{pct}%</Badge>
          </div>
          <p className="mt-2 text-3xl font-bold">{formatEUR(totals.estimatedCents)}</p>
          <p className="text-sm text-stone-500">de {formatEUR(budget)} (gasto estimado)</p>
          <div className="mt-3">
            <ProgressBar value={pct} tone={totals.estimatedCents > budget ? "bad" : pct > 85 ? "warn" : "good"} />
          </div>
          {totals.unknownCount > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {totals.unknownCount} producto(s) sin precio conocido: el total esta incompleto.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-stone-500">Supermercado recomendado</h2>
          {recName ? (
            <>
              <p className="mt-2 text-2xl font-bold">{recName}</p>
              <p className="text-sm text-stone-500">
                Total comparable: {formatEUR(rec!.adjustedCents)}
                {rec!.imputedCount > 0 && ` (${rec!.imputedCount} precio(s) tomados de otra tienda)`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Sin precios suficientes para recomendar.</p>
          )}
          <Link href="/compare" className="mt-3 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Ver comparacion
          </Link>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-stone-500">Lista de compras</h2>
            <span className="text-sm font-medium">{totals.progress}%</span>
          </div>
          <div className="mt-3">
            <ProgressBar value={totals.progress} />
          </div>
          <p className="mt-2 text-sm text-stone-500">
            {totals.count - totals.checkedCount} pendientes de {totals.count}
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-stone-500">En casa</h2>
          <p className="mt-2 text-3xl font-bold">{pantryCount}</p>
          <p className="text-sm text-stone-500">ingredientes en la despensa</p>
          <Link href="/pantry" className="mt-3 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Ver despensa
          </Link>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Hoy</h2>
      {meals.entries.length === 0 ? (
        <Empty>Hoy no hay comidas en el plan activo.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {meals.entries.map((e) => (
            <Card key={e.id} className="flex items-center justify-between gap-3 !p-3">
              <div>
                <p className="text-xs font-medium text-stone-500">{SLOT_LABEL[e.slot]}</p>
                {e.status === "skipped" ? (
                  <p className="font-medium text-stone-500">{SKIP_LABEL[e.skipReason ?? "other"]}</p>
                ) : e.recipe ? (
                  <Link href={`/recipes/${e.recipe.id}`} className="font-medium">
                    {e.recipe.name}
                  </Link>
                ) : (
                  <p className="text-stone-400">Sin receta</p>
                )}
              </div>
              {e.recipe && e.status !== "skipped" && (
                <span className="text-xs text-stone-500">{e.recipe.minutes} min</span>
              )}
            </Card>
          ))}
          <p className="mt-1 text-xs text-stone-500">
            Resumen nutricional de hoy (estimado): {Math.round(meals.nutrition.kcal)} kcal · {Math.round(meals.nutrition.protein)} g proteina · {Math.round(meals.nutrition.carbs)} g carbohidratos · {Math.round(meals.nutrition.fat)} g grasa
            {!meals.nutrition.complete && " (incompleto)"}
          </p>
        </div>
      )}
    </>
  );
}
