"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Card, SKIP_LABEL, SLOT_LABEL, btnDanger, btnSecondary } from "@/components/ui";
import { formatDayShort } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import type { EntryView } from "@/server/queries";
import {
  clearEntryAction,
  duplicateEntryAction,
  getAlternativesAction,
  searchRecipesAction,
  setEatenAction,
  setRecipePrefAction,
  setServingsAction,
  setSkipAction,
  swapEntryAction,
} from "@/server/actions";

type Alt = { id: number; name: string; minutes: number };

export function EntryCard({
  entry,
  slotLabel,
  dates,
  slots,
}: {
  entry: EntryView;
  slotLabel: string;
  dates: string[];
  slots: ("breakfast" | "lunch" | "dinner" | "snack")[];
}) {
  const [pending, start] = useTransition();
  const [alts, setAlts] = useState<Alt[] | null>(null);
  const [menu, setMenu] = useState(false);
  const [dup, setDup] = useState(false);
  const [dupDate, setDupDate] = useState(dates[0]);
  const [dupSlot, setDupSlot] = useState(entry.slot);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Alt[]>([]);
  const router = useRouter();

  /** Abre el formulario de receta con el nombre escrito; al guardar, la receta queda en esta comida. */
  const createOwn = () => {
    const back = `${window.location.pathname}${window.location.search}`;
    const params = new URLSearchParams({ name: query.trim(), entry: String(entry.id), slot: entry.slot, back });
    router.push(`/recipes/new?${params.toString()}`);
  };

  const r = entry.recipe;
  const skipped = entry.status === "skipped";
  const eaten = entry.status === "eaten";

  return (
    <Card className={`!p-3 ${pending ? "opacity-60" : ""} ${eaten ? "border-emerald-300 dark:border-emerald-800" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-500">{slotLabel}</p>
          {skipped ? (
            <p className="font-medium text-stone-500">{SKIP_LABEL[entry.skipReason ?? "other"]} · no se planifica</p>
          ) : r ? (
            <Link href={`/recipes/${r.id}`} className="font-medium leading-snug">
              {r.name}
            </Link>
          ) : (
            <p className="text-stone-400">Sin receta</p>
          )}
          {r && !skipped && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge>{r.minutes} min</Badge>
              <Badge>{r.costUnknown > 0 ? `~${formatEUR(r.costCents)}*` : formatEUR(r.costCents)}/porcion</Badge>
              <Badge>
                {Math.round(r.nutrition.kcal)} kcal{!r.nutrition.complete ? "*" : ""} · {Math.round(r.nutrition.protein)} g prot (est.)
              </Badge>
              {r.auto && <Badge tone="info">Segun ofertas</Badge>}
              {r.pref === "favorite" && <Badge tone="good">Favorita</Badge>}
              {entry.servings !== 1 && <Badge tone="info">{entry.servings} porciones</Badge>}
              {eaten && <Badge tone="good">Comida</Badge>}
            </div>
          )}
        </div>
        <button
          className="rounded-lg px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          onClick={() => setMenu((m) => !m)}
          aria-label="Opciones de la comida"
          aria-expanded={menu}
        >
          ⋯
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {menu && (
        <div className="mt-3 flex flex-col gap-2 border-t border-stone-100 pt-3 dark:border-stone-800">
          <div className="flex flex-wrap gap-2">
            {!skipped && (
              <button
                className={btnSecondary}
                onClick={() =>
                  run(async () => {
                    setAlts(await getAlternativesAction(entry.id));
                  })
                }
              >
                Cambiar receta
              </button>
            )}
            {!skipped && r && (
              <>
                <button className={btnSecondary} onClick={() => setDup((d) => !d)}>
                  Duplicar
                </button>
                <button
                  className={btnSecondary}
                  onClick={() => run(() => setEatenAction({ entryId: entry.id, eaten: !eaten }))}
                >
                  {eaten ? "Desmarcar comida" : "Marcar como comida"}
                </button>
                <button
                  className={btnSecondary}
                  onClick={() =>
                    run(() => setRecipePrefAction({ recipeId: r.id, status: r.pref === "favorite" ? null : "favorite" }))
                  }
                >
                  {r.pref === "favorite" ? "Quitar favorita" : "Favorita"}
                </button>
                <button
                  className={btnDanger}
                  onClick={() =>
                    run(async () => {
                      await setRecipePrefAction({ recipeId: r.id, status: "discarded" });
                      await clearEntryAction(entry.id);
                    })
                  }
                >
                  Descartar receta
                </button>
              </>
            )}
            <button
              className={btnSecondary}
              onClick={() =>
                run(() =>
                  setSkipAction({ entryId: entry.id, skip: !skipped, reason: skipped ? undefined : "out" }),
                )
              }
            >
              {skipped ? "Planificar esta comida" : "No como en casa"}
            </button>
            {!skipped && r && (
              <button className={btnDanger} onClick={() => run(() => clearEntryAction(entry.id))}>
                Quitar
              </button>
            )}
          </div>

          {!skipped && r && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-stone-500">Porciones</span>
              <button
                className={btnSecondary}
                aria-label="Menos porciones"
                onClick={() => run(() => setServingsAction({ entryId: entry.id, servings: Math.max(0.5, entry.servings - 0.5) }))}
              >
                −
              </button>
              <span className="w-8 text-center font-medium">{entry.servings}</span>
              <button
                className={btnSecondary}
                aria-label="Mas porciones"
                onClick={() => run(() => setServingsAction({ entryId: entry.id, servings: Math.min(12, entry.servings + 0.5) }))}
              >
                +
              </button>
            </div>
          )}

          {dup && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 dark:border-stone-700 dark:bg-stone-900"
                value={dupDate}
                onChange={(e) => setDupDate(e.target.value)}
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {formatDayShort(d)}
                  </option>
                ))}
              </select>
              <select
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 dark:border-stone-700 dark:bg-stone-900"
                value={dupSlot}
                onChange={(e) => setDupSlot(e.target.value as typeof dupSlot)}
              >
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABEL[s]}
                  </option>
                ))}
              </select>
              <button
                className={btnSecondary}
                onClick={() =>
                  run(async () => {
                    await duplicateEntryAction({ entryId: entry.id, toDate: dupDate, slot: dupSlot });
                    setDup(false);
                  })
                }
              >
                Copiar aqui
              </button>
            </div>
          )}

          {alts && (
            <div className="flex flex-col gap-2 rounded-xl bg-stone-50 p-2.5 dark:bg-stone-800/50">
              <p className="text-xs text-stone-500">¿Se te ocurrió otra? Escribí el plato (ej. sándwich de jamón y queso):</p>
              <input
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
                placeholder="Escribir una comida..."
                value={query}
                onChange={(e) => {
                  const q = e.target.value;
                  setQuery(q);
                  run(async () => setFound(await searchRecipesAction(q)));
                }}
              />
              {found.map((a) => (
                <button
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-sm hover:border-emerald-600 dark:border-stone-700 dark:bg-stone-900"
                  onClick={() =>
                    run(async () => {
                      await swapEntryAction({ entryId: entry.id, recipeId: a.id });
                      setAlts(null);
                      setMenu(false);
                    })
                  }
                >
                  <span>{a.name}</span>
                  <span className="text-xs text-stone-500">{a.minutes} min</span>
                </button>
              ))}
              {query.trim().length > 1 && (
                <button className={btnSecondary} onClick={() => createOwn()}>
                  {found.length === 0 ? "No la encontré: " : "Ninguna es: "}crear «{query.trim()}» con su preparación
                </button>
              )}
            </div>
          )}

          {alts && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-stone-500">Alternativas (el resto del plan no cambia):</p>
              {alts.length === 0 && <p className="text-sm text-stone-400">No hay otras recetas disponibles.</p>}
              {alts.map((a) => (
                <button
                  key={a.id}
                  className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-left text-sm hover:border-emerald-600 dark:border-stone-700"
                  onClick={() =>
                    run(async () => {
                      await swapEntryAction({ entryId: entry.id, recipeId: a.id });
                      setAlts(null);
                      setMenu(false);
                    })
                  }
                >
                  <span>{a.name}</span>
                  <span className="text-xs text-stone-500">{a.minutes} min</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-stone-400">* costo o nutricion parcial: faltan precios o datos de algun ingrediente.</p>
        </div>
      )}
    </Card>
  );
}
