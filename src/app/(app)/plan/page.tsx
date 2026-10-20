import Link from "next/link";
import { Badge, Card, Empty, PageHeader, SLOT_LABEL } from "@/components/ui";
import { addDays, formatDay, todayISO } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { loadCatalog } from "@/server/catalog";
import { enabledSlots } from "@/server/plans";
import { getActivePlan, getEntryViews } from "@/server/queries";
import { EntryCard } from "./entry-card";
import { PlanGenerator } from "./generator";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const { plan, all } = await getActivePlan(sp.plan ? Number(sp.plan) : null);
  const data = await loadCatalog();
  const slots = enabledSlots(data.profile);
  const entries = plan ? await getEntryViews(plan.id, data) : [];
  const dates = plan ? Array.from({ length: plan.days }, (_, i) => addDays(plan.weekStart, i)) : [];
  const today = todayISO();

  const planCost = entries
    .filter((e) => e.status === "planned" && e.recipe)
    .reduce((sum, e) => sum + (e.recipe?.costCents ?? 0) * e.servings, 0);

  return (
    <>
      <PageHeader
        title="Plan de comidas"
        subtitle={plan ? `${formatDay(plan.weekStart)} · ${plan.days} dias · presupuesto ${formatEUR(plan.budgetCents)}` : "Genera tu primer plan"}
      />

      {all.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {all.map((p) => (
            <Link
              key={p.id}
              href={`/plan?plan=${p.id}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                plan?.id === p.id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-400"
              }`}
            >
              {p.weekStart} ({p.days}d)
            </Link>
          ))}
        </div>
      )}

      <PlanGenerator
        slots={slots}
        defaultBudgetCents={data.profile.weeklyBudgetCents}
        defaultStart={plan?.weekStart ?? today}
        defaultDays={plan?.days ?? 7}
        hasPlan={!!plan}
      />

      {!plan ? (
        <div className="mt-6">
          <Empty>Configura los dias y genera el plan.</Empty>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {plan && (
            <p className="text-sm text-stone-500">
              Costo estimado de las comidas planificadas (por porcion, sin redondear a envases): {formatEUR(Math.round(planCost))}
            </p>
          )}
          {dates.map((date) => {
            const dayEntries = entries.filter((e) => e.date === date);
            return (
              <section key={date}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize">
                  {formatDay(date)}
                  {date === today && <Badge tone="info">Hoy</Badge>}
                </h2>
                <div className="flex flex-col gap-2">
                  {dayEntries.length === 0 && <Card className="!p-3 text-sm text-stone-400">Sin comidas configuradas</Card>}
                  {dayEntries.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      slotLabel={SLOT_LABEL[e.slot]}
                      dates={dates}
                      slots={slots}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
