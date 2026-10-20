"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Card, SLOT_LABEL, btnPrimary, input } from "@/components/ui";
import { addDays, formatDayShort, isValidISODate } from "@/lib/dates";
import { parseEuros } from "@/lib/money";
import { generatePlanAction } from "@/server/actions";

type Slot = "breakfast" | "lunch" | "dinner" | "snack";
type Where = "home" | "work" | "out" | "other";

export function PlanGenerator({
  slots,
  defaultBudgetCents,
  defaultStart,
  defaultDays,
  hasPlan,
}: {
  slots: Slot[];
  defaultBudgetCents: number;
  defaultStart: string;
  defaultDays: number;
  hasPlan: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasPlan);
  const [start, setStart] = useState(defaultStart);
  const [days, setDays] = useState(defaultDays);
  const [budget, setBudget] = useState((defaultBudgetCents / 100).toFixed(2));
  const [away, setAway] = useState<Record<string, Where>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dates = useMemo(
    () => (isValidISODate(start) ? Array.from({ length: days }, (_, i) => addDays(start, i)) : []),
    [start, days],
  );

  const submit = () => {
    setError(null);
    setMessage(null);
    const budgetCents = parseEuros(budget);
    if (budgetCents === null) return setError("Presupuesto invalido");
    if (!isValidISODate(start)) return setError("Fecha de inicio invalida");
    if (
      hasPlan &&
      !confirm("Esto reemplaza las comidas de ese periodo (la lista de compras conserva lo ya marcado). ¿Continuar?")
    ) {
      return;
    }
    const skips = Object.entries(away)
      .filter(([, w]) => w !== "home")
      .map(([key, w]) => {
        const [date, slot] = key.split("|");
        return { date, slot: slot as Slot, reason: w as "work" | "out" | "other" };
      })
      .filter((k) => dates.includes(k.date));
    startTransition(async () => {
      try {
        const res = await generatePlanAction({ weekStart: start, days, budgetCents, skips });
        setMessage(
          `Plan generado. Costo estimado ${(res.estimatedCostCents / 100).toFixed(2)} EUR` +
            (res.warnings.length ? ` · ${res.warnings.join(" · ")}` : ""),
        );
        setOpen(false);
        router.push(`/plan?plan=${res.planId}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo generar el plan");
      }
    });
  };

  return (
    <Card>
      <button
        className="flex w-full items-center justify-between text-left font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {hasPlan ? "Generar un plan nuevo" : "Configurar y generar plan"}
        <span className="text-stone-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-3 text-sm sm:col-span-1">
              <span className="mb-1 block text-stone-500">Desde</span>
              <input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Dias</span>
              <input
                type="number"
                min={1}
                max={14}
                className={input}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-stone-500">Presupuesto (EUR)</span>
              <input className={input} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Donde comes cada dia</p>
            <p className="mb-2 text-xs text-stone-500">
              Las comidas fuera de casa o cubiertas por el trabajo no se planifican ni suman a la compra.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-stone-500">
                    <th className="py-1 pr-2 font-medium">Dia</th>
                    {slots.map((s) => (
                      <th key={s} className="px-1 py-1 font-medium">
                        {SLOT_LABEL[s]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d) => (
                    <tr key={d} className="border-t border-stone-100 dark:border-stone-800">
                      <td className="whitespace-nowrap py-1.5 pr-2 capitalize">{formatDayShort(d)}</td>
                      {slots.map((s) => (
                        <td key={s} className="px-1 py-1">
                          <select
                            className="w-full rounded-lg border border-stone-300 bg-white px-1.5 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
                            value={away[`${d}|${s}`] ?? "home"}
                            onChange={(e) => setAway((a) => ({ ...a, [`${d}|${s}`]: e.target.value as Where }))}
                          >
                            <option value="home">En casa</option>
                            <option value="work">Trabajo</option>
                            <option value="out">Fuera</option>
                            <option value="other">Otro</option>
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className={btnPrimary} onClick={submit} disabled={pending}>
            {pending ? "Generando..." : "Generar plan"}
          </button>
        </div>
      )}
      {message && !open && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
    </Card>
  );
}
