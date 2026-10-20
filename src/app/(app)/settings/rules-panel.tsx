"use client";

import { useState, useTransition } from "react";
import { Badge, btnPrimary, input } from "@/components/ui";
import { addRuleAction, deleteRuleAction } from "@/server/actions";

type Rule = { id: number; kind: "allergy" | "avoid" | "restriction" | "staple"; value: string };
const LABEL = { allergy: "Alergia", avoid: "Evitar", restriction: "Restriccion", staple: "Siempre en casa" } as const;

export function RulesPanel({ rules }: { rules: Rule[] }) {
  const [kind, setKind] = useState<Rule["kind"]>("avoid");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {rules.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 py-1 pl-3 pr-1 text-sm dark:border-stone-700">
            <Badge tone={r.kind === "allergy" ? "bad" : r.kind === "staple" ? "info" : "warn"}>{LABEL[r.kind]}</Badge>
            {r.value}
            <button
              className="grid h-6 w-6 place-items-center rounded-full text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label={`Quitar ${r.value}`}
              onClick={() => start(() => deleteRuleAction(r.id))}
            >
              ×
            </button>
          </span>
        ))}
        {rules.length === 0 && <p className="text-sm text-stone-400">Sin reglas</p>}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          start(async () => {
            try {
              setError(null);
              await addRuleAction({ kind, value });
              setValue("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Error");
            }
          });
        }}
      >
        <select
          className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm dark:border-stone-700 dark:bg-stone-900"
          value={kind}
          onChange={(e) => setKind(e.target.value as Rule["kind"])}
          aria-label="Tipo"
        >
          {Object.entries(LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className={`${input} min-w-0 flex-1`} placeholder="ej. brocoli, gluten, Aceite de oliva" value={value} onChange={(e) => setValue(e.target.value)} />
        <button className={btnPrimary} disabled={pending || !value.trim()}>
          Agregar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
