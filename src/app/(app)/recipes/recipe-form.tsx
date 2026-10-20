"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CATEGORY_LABEL, SLOT_LABEL, btnPrimary, btnSecondary, input } from "@/components/ui";
import { swapEntryAction } from "@/server/actions";
import { createIngredientAction, draftRecipeAction, saveRecipeAction } from "@/server/recipe-actions";

type Ing = { id: number; name: string; baseUnit: "g" | "ml" | "unit" };
type Row = { key: number; ingredientId: string; quantity: string; unit: string };

export type RecipeFormInitial = {
  id?: number;
  name: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  minutes: number;
  servings: number;
  instructions: string;
  imageUrl: string;
  tags: string;
  rows: { ingredientId: number; quantity: number }[];
};

const defaultUnit = (u: Ing["baseUnit"]) => u;

export function RecipeForm({
  initial,
  ingredients: initialIngredients,
  aiAvailable = false,
  assign,
}: {
  initial: RecipeFormInitial;
  ingredients: Ing[];
  /** Hay clave de IA en el servidor: se ofrece sugerir ingredientes y preparacion. */
  aiAvailable?: boolean;
  /** Si viene de "Cambiar receta": al guardar, la receta queda en esa comida del plan. */
  assign?: { entryId: number; back: string };
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [name, setName] = useState(initial.name);
  const [mealType, setMealType] = useState(initial.mealType);
  const [minutes, setMinutes] = useState(String(initial.minutes));
  const [servings, setServings] = useState(String(initial.servings));
  const [instructions, setInstructions] = useState(initial.instructions);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [tags, setTags] = useState(initial.tags);
  const [rows, setRows] = useState<Row[]>(
    initial.rows.length > 0
      ? initial.rows.map((r, i) => ({
          key: i,
          ingredientId: String(r.ingredientId),
          quantity: String(r.quantity),
          unit: defaultUnit(initialIngredients.find((x) => x.id === r.ingredientId)?.baseUnit ?? "g"),
        }))
      : [{ key: 0, ingredientId: "", quantity: "", unit: "g" }],
  );
  const [nextKey, setNextKey] = useState(initial.rows.length + 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState<Ing["baseUnit"]>("g");
  const [newCategory, setNewCategory] = useState("otros");
  const [newGpu, setNewGpu] = useState("");
  const [nut, setNut] = useState({ kcal: "", protein: "", carbs: "", fat: "", fromLabel: false });

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const res = await saveRecipeAction({
          id: initial.id,
          name,
          mealType,
          minutes: Number(minutes),
          servings: Number(servings.replace(",", ".")),
          instructions,
          imageUrl: imageUrl.trim() === "" ? null : imageUrl,
          tags,
          items: rows
            .filter((r) => r.ingredientId !== "")
            .map((r) => ({
              ingredientId: Number(r.ingredientId),
              quantity: Number(r.quantity.replace(",", ".")),
              unit: r.unit,
            })),
        });
        if (assign) {
          await swapEntryAction({ entryId: assign.entryId, recipeId: res.id });
          router.push(assign.back);
        } else {
          router.push(`/recipes/${res.id}`);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });

  const [note, setNote] = useState<string | null>(null);
  const suggest = () =>
    start(async () => {
      setError(null);
      setNote(null);
      try {
        const res = await draftRecipeAction(name);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        setMinutes(String(res.minutes));
        setInstructions(res.instructions);
        setRows(
          res.items.map((it, i) => ({
            key: nextKey + i,
            ingredientId: String(it.ingredientId),
            quantity: String(it.quantity),
            unit: ingredients.find((x) => x.id === it.ingredientId)?.baseUnit ?? "g",
          })),
        );
        setNextKey((k) => k + res.items.length);
        setNote(
          `Sugerencia de la IA: revisala antes de guardar.${res.missing.length > 0 ? ` Le faltan en el catalogo: ${res.missing.join(", ")} (podes crearlos abajo).` : ""}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo pedir la sugerencia");
      }
    });

  const createIng = () =>
    start(async () => {
      setError(null);
      try {
        const hasNut = [nut.kcal, nut.protein, nut.carbs, nut.fat].every((v) => v.trim() !== "");
        const res = await createIngredientAction({
          name: newName,
          category: newCategory as never,
          baseUnit: newUnit,
          gramsPerUnit: newGpu.trim() === "" ? null : Number(newGpu.replace(",", ".")),
          nutrition: hasNut
            ? {
                kcal: Number(nut.kcal),
                protein: Number(nut.protein),
                carbs: Number(nut.carbs),
                fat: Number(nut.fat),
                fromLabel: nut.fromLabel,
              }
            : null,
        });
        setIngredients((l) => [...l, { id: res.id, name: newName.trim(), baseUnit: newUnit }].sort((a, b) => a.name.localeCompare(b.name, "es")));
        setNewName("");
        setNewGpu("");
        setNut({ kcal: "", protein: "", carbs: "", fat: "", fromLabel: false });
        setShowNew(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear el ingrediente");
      }
    });

  const S = "mb-1 block text-xs text-stone-500";
  return (
    <div className="grid gap-4">
      <label className="text-sm">
        <span className={S}>Nombre</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {aiAvailable && (
        <div>
          <button className={btnSecondary} onClick={suggest} disabled={pending || name.trim().length < 2}>
            Sugerir ingredientes y preparacion con IA
          </button>
          {note && <p className="mt-2 text-xs text-stone-500">{note}</p>}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className={S}>Tipo</span>
          <select className={input} value={mealType} onChange={(e) => setMealType(e.target.value as typeof mealType)}>
            {Object.entries(SLOT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={S}>Minutos</span>
          <input className={input} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className={S}>Porciones</span>
          <input className={input} inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
      </div>

      <div>
        <p className={S}>Ingredientes (las cantidades son para las porciones indicadas)</p>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2">
              <select
                className={input}
                value={r.ingredientId}
                aria-label="Ingrediente"
                onChange={(e) => {
                  const ing = ingredients.find((i) => String(i.id) === e.target.value);
                  setRow(r.key, { ingredientId: e.target.value, unit: ing ? defaultUnit(ing.baseUnit) : r.unit });
                }}
              >
                <option value="">Elegir...</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input className={input} inputMode="decimal" aria-label="Cantidad" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} />
              <select className={input} aria-label="Unidad" value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })}>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">L</option>
                <option value="unit">u</option>
              </select>
              <button
                className="rounded-lg text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                aria-label="Quitar ingrediente"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={btnSecondary}
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, ingredientId: "", quantity: "", unit: "g" }]);
              setNextKey((k) => k + 1);
            }}
          >
            + Ingrediente
          </button>
          <button className={btnSecondary} onClick={() => setShowNew((s) => !s)}>
            {showNew ? "Cancelar nuevo ingrediente" : "Crear ingrediente nuevo"}
          </button>
        </div>
      </div>

      {showNew && (
        <div className="grid gap-3 rounded-2xl border border-stone-200 p-3 dark:border-stone-700">
          <input className={input} placeholder="Nombre del ingrediente" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <select className={input} value={newUnit} onChange={(e) => setNewUnit(e.target.value as Ing["baseUnit"])} aria-label="Unidad base">
              <option value="g">gramos</option>
              <option value="ml">ml</option>
              <option value="unit">unidades</option>
            </select>
            <select className={input} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} aria-label="Categoria">
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className={input} inputMode="decimal" placeholder="g por unidad" value={newGpu} onChange={(e) => setNewGpu(e.target.value)} />
          </div>
          <p className="text-xs text-stone-500">Nutricion por 100 g/ml (opcional; si la dejas vacia, la receta se marca como incompleta):</p>
          <div className="grid grid-cols-4 gap-2">
            {(["kcal", "protein", "carbs", "fat"] as const).map((k) => (
              <input
                key={k}
                className={input}
                inputMode="decimal"
                placeholder={{ kcal: "kcal", protein: "prot", carbs: "carb", fat: "grasa" }[k]}
                value={nut[k]}
                onChange={(e) => setNut((n) => ({ ...n, [k]: e.target.value }))}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={nut.fromLabel} onChange={(e) => setNut((n) => ({ ...n, fromLabel: e.target.checked }))} />
            Los valores salen de la etiqueta del producto (si no, se guardan como estimacion)
          </label>
          <button className={btnPrimary} onClick={createIng} disabled={pending || newName.trim() === ""}>
            Crear ingrediente
          </button>
        </div>
      )}

      <label className="text-sm">
        <span className={S}>Preparacion (un paso por linea)</span>
        <textarea className={input} rows={6} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className={S}>Imagen (URL, opcional)</span>
          <input className={input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </label>
        <label className="text-sm">
          <span className={S}>Etiquetas (separadas por coma)</span>
          <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className={btnPrimary} onClick={save} disabled={pending || name.trim() === ""}>
          Guardar receta
        </button>
        <button className={btnSecondary} onClick={() => router.back()}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
