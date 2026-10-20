"use client";

import { useState, useTransition } from "react";
import { Card, CATEGORY_LABEL, btnDanger, btnPrimary, btnSecondary, input } from "@/components/ui";
import { deletePantryItemAction, savePantryItemAction } from "@/server/actions";
import type { PantryItem } from "@/db/schema";

type Ing = { id: number; name: string; baseUnit: "g" | "ml" | "unit"; category: string };

export function PantryEditor({ ingredients, rows }: { ingredients: Ing[]; rows: PantryItem[] }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [ingredientId, setIngredientId] = useState<string>("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [category, setCategory] = useState("otros");
  const [location, setLocation] = useState<"despensa" | "heladera" | "congelador">("despensa");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ing = ingredients.find((i) => String(i.id) === ingredientId);

  const reset = () => {
    setEditId(null);
    setIngredientId("");
    setName("");
    setQty("");
    setUnit("g");
    setCategory("otros");
    setLocation("despensa");
    setExpires("");
    setError(null);
  };

  const edit = (r: PantryItem) => {
    setEditId(r.id);
    setIngredientId(r.ingredientId ? String(r.ingredientId) : "");
    setName(r.name);
    setQty(String(r.quantity));
    setUnit(r.unit === "unit" ? "unit" : r.unit);
    setCategory(r.category);
    setLocation(r.location);
    setExpires(r.expiresOn ?? "");
    setOpen(true);
  };

  const submit = () =>
    start(async () => {
      try {
        setError(null);
        const q = Number(qty.replace(",", "."));
        if (!(q >= 0)) throw new Error("Cantidad invalida");
        await savePantryItemAction({
          id: editId ?? undefined,
          name: ing?.name ?? name,
          ingredientId: ing?.id ?? null,
          quantity: q,
          inputUnit: unit,
          unit: ing?.baseUnit ?? (unit === "kg" ? "g" : unit === "l" ? "ml" : (unit as "g" | "ml" | "unit")),
          category: (ing?.category ?? category) as never,
          location,
          expiresOn: expires === "" ? null : expires,
        });
        reset();
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className={btnPrimary} onClick={() => (open ? (reset(), setOpen(false)) : setOpen(true))}>
          {open ? "Cerrar" : "+ Agregar a la despensa"}
        </button>
        {rows.length > 0 && !open && (
          <select
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
            value=""
            onChange={(e) => {
              const r = rows.find((x) => String(x.id) === e.target.value);
              if (r) edit(r);
            }}
            aria-label="Editar un producto"
          >
            <option value="">Editar producto...</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {open && (
        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-stone-500">Ingrediente conocido (lo usa el plan) o escribi uno libre</span>
            <select className={input} value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
              <option value="">Otro (libre)</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          {!ing && <input className={input} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />}
          <div className="grid grid-cols-2 gap-2">
            <input className={input} inputMode="decimal" placeholder="Cantidad" value={qty} onChange={(e) => setQty(e.target.value)} />
            <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad">
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">L</option>
              <option value="unit">unidades</option>
            </select>
          </div>
          {!ing && (
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select className={input} value={location} onChange={(e) => setLocation(e.target.value as typeof location)} aria-label="Ubicacion">
              <option value="despensa">Despensa</option>
              <option value="heladera">Heladera</option>
              <option value="congelador">Congelador</option>
            </select>
            <input type="date" className={input} value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Vencimiento" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={pending || (!ing && name.trim() === "") || qty.trim() === ""} onClick={submit}>
              {editId ? "Guardar cambios" : "Agregar"}
            </button>
            {editId && (
              <>
                <button
                  className={btnDanger}
                  onClick={() =>
                    start(async () => {
                      await deletePantryItemAction(editId);
                      reset();
                      setOpen(false);
                    })
                  }
                >
                  Eliminar
                </button>
                <button className={btnSecondary} onClick={reset}>
                  Cancelar edicion
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
