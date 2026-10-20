"use client";

import { useState, useTransition } from "react";
import { btnPrimary, input } from "@/components/ui";
import { parseEuros } from "@/lib/money";
import { updateProfileAction } from "@/server/actions";

type Initial = {
  weeklyBudgetCents: number;
  goal: string;
  kcalTarget: number | null;
  proteinTargetG: number | null;
  cookMinutesPerMeal: number;
  fridgeLimited: boolean;
  planBreakfast: boolean;
  planLunch: boolean;
  planDinner: boolean;
  planSnacks: boolean;
  mealPrepRequired: boolean;
  travelCostCents: number;
  timePenaltyCents: number;
  notes: string | null;
};

const eur = (c: number) => (c / 100).toFixed(2);

export function ProfileForm({ initial }: { initial: Initial }) {
  const [budget, setBudget] = useState(eur(initial.weeklyBudgetCents));
  const [goal, setGoal] = useState(initial.goal);
  const [kcal, setKcal] = useState(initial.kcalTarget?.toString() ?? "");
  const [protein, setProtein] = useState(initial.proteinTargetG?.toString() ?? "");
  const [minutes, setMinutes] = useState(String(initial.cookMinutesPerMeal));
  const [travel, setTravel] = useState(eur(initial.travelCostCents));
  const [timePen, setTimePen] = useState(eur(initial.timePenaltyCents));
  const [fridge, setFridge] = useState(initial.fridgeLimited);
  const [prep, setPrep] = useState(initial.mealPrepRequired);
  const [meals, setMeals] = useState({
    planBreakfast: initial.planBreakfast,
    planLunch: initial.planLunch,
    planDinner: initial.planDinner,
    planSnacks: initial.planSnacks,
  });
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const b = parseEuros(budget);
      const t = parseEuros(travel);
      const tp = parseEuros(timePen);
      if (b === null || t === null || tp === null) return setMsg({ ok: false, text: "Revisa los importes" });
      try {
        await updateProfileAction({
          weeklyBudgetCents: b,
          goal,
          kcalTarget: kcal.trim() === "" ? null : Number(kcal),
          proteinTargetG: protein.trim() === "" ? null : Number(protein),
          cookMinutesPerMeal: Number(minutes),
          fridgeLimited: fridge,
          mealPrepRequired: prep,
          travelCostCents: t,
          timePenaltyCents: tp,
          notes: notes.trim() === "" ? null : notes,
          ...meals,
        });
        setMsg({ ok: true, text: "Guardado" });
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar" });
      }
    });

  const L = "text-sm";
  const S = "mb-1 block text-xs text-stone-500";
  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={value} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={L}>
          <span className={S}>Presupuesto semanal (EUR)</span>
          <input className={input} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className={L}>
          <span className={S}>Tiempo por comida (min)</span>
          <input className={input} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label className={L}>
          <span className={S}>Calorias objetivo (opcional)</span>
          <input className={input} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <label className={L}>
          <span className={S}>Proteina objetivo g (opcional)</span>
          <input className={input} inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
        <label className={L}>
          <span className={S}>Costo de ir a otra tienda (EUR)</span>
          <input className={input} inputMode="decimal" value={travel} onChange={(e) => setTravel(e.target.value)} />
        </label>
        <label className={L}>
          <span className={S}>Penalizacion por tiempo (EUR)</span>
          <input className={input} inputMode="decimal" value={timePen} onChange={(e) => setTimePen(e.target.value)} />
        </label>
      </div>
      <label className={L}>
        <span className={S}>Objetivo</span>
        <input className={input} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <div>
        <p className={S}>Comidas que se planifican</p>
        <div className="grid grid-cols-2 gap-2">
          {check("Desayuno", meals.planBreakfast, (v) => setMeals((m) => ({ ...m, planBreakfast: v })))}
          {check("Almuerzo", meals.planLunch, (v) => setMeals((m) => ({ ...m, planLunch: v })))}
          {check("Cena", meals.planDinner, (v) => setMeals((m) => ({ ...m, planDinner: v })))}
          {check("Snacks", meals.planSnacks, (v) => setMeals((m) => ({ ...m, planSnacks: v })))}
        </div>
      </div>
      <div className="grid gap-2">
        {check("Espacio de heladera limitado", fridge, setFridge)}
        {check("Meal prep obligatorio", prep, setPrep)}
      </div>
      <label className={L}>
        <span className={S}>Notas</span>
        <textarea className={input} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={save} disabled={pending}>
          Guardar
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
