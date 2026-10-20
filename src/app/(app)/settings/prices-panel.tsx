"use client";

import { useState, useTransition } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import { parseEuros } from "@/lib/money";
import { addPriceAction, addProductAction, importPricesCsvAction } from "@/server/actions";

function NewProductForm({
  stores,
  ingredients,
}: {
  stores: { id: number; name: string }[];
  ingredients: { id: number; name: string; baseUnit: "g" | "ml" | "unit" }[];
}) {
  const [storeId, setStoreId] = useState(String(stores[0]?.id ?? ""));
  const [ingredientId, setIngredientId] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState("g");
  const [byWeight, setByWeight] = useState(false);
  const [price, setPrice] = useState("");
  const [promo, setPromo] = useState("");
  const [until, setUntil] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const sizeNum = Number(size.replace(",", "."));
  const valid =
    storeId !== "" && ingredientId !== "" && name.trim() !== "" && sizeNum > 0 && parseEuros(price) !== null;

  return (
    <div className="grid gap-3">
      <p className="text-sm font-medium">Agregar un producto de un supermercado</p>
      <p className="text-xs text-stone-500">
        Para productos que todavia no estan cargados (por ejemplo los de Iper). El precio queda confirmado por vos, con fecha de hoy.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Tienda">
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className={input}
          value={ingredientId}
          aria-label="Ingrediente"
          onChange={(e) => {
            setIngredientId(e.target.value);
            const ing = ingredients.find((i) => String(i.id) === e.target.value);
            if (ing) setUnit(ing.baseUnit);
          }}
        >
          <option value="">Ingrediente...</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Nombre del producto" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Marca (opcional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className={input} inputMode="decimal" placeholder="Tamano" value={size} onChange={(e) => setSize(e.target.value)} />
        <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unidad del tamano">
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="ml">ml</option>
          <option value="l">L</option>
          <option value="unit">unidades</option>
        </select>
        <input className={input} inputMode="decimal" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={byWeight} onChange={(e) => setByWeight(e.target.checked)} />
        Se vende al peso (pagas lo que se pesa; el precio es por el tamano indicado, ej. por 1 kg)
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} inputMode="decimal" placeholder="Precio promo (opcional)" value={promo} onChange={(e) => setPromo(e.target.value)} />
        <input type="date" className={input} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Vigente hasta" />
      </div>
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending || !valid}
          onClick={() =>
            start(async () => {
              try {
                await addProductAction({
                  storeId: Number(storeId),
                  ingredientId: Number(ingredientId),
                  name,
                  brand: brand.trim() === "" ? null : brand,
                  packSize: sizeNum,
                  packUnit: unit,
                  soldByWeight: byWeight,
                  priceCents: parseEuros(price) as number,
                  promoPriceCents: promo.trim() === "" ? null : parseEuros(promo),
                  validUntil: until === "" ? null : until,
                });
                setName("");
                setBrand("");
                setSize("");
                setPrice("");
                setPromo("");
                setUntil("");
                setMsg({ ok: true, text: "Producto y precio guardados" });
              } catch (e) {
                setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" });
              }
            })
          }
        >
          Guardar producto
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function PricesPanel({
  products,
  csvHeader,
  stores,
  ingredients,
}: {
  products: { id: number; label: string }[];
  csvHeader: string;
  stores: { id: number; name: string }[];
  ingredients: { id: number; name: string; baseUnit: "g" | "ml" | "unit" }[];
}) {
  const [productId, setProductId] = useState<string>(products[0]?.id ? String(products[0].id) : "");
  const [price, setPrice] = useState("");
  const [promo, setPromo] = useState("");
  const [until, setUntil] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-6">
      <NewProductForm stores={stores} ingredients={ingredients} />
      <div className="grid gap-3">
        <p className="text-sm font-medium">Cargar un precio que viste en el estante</p>
        <select className={input} value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Producto">
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input className={input} inputMode="decimal" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className={input} inputMode="decimal" placeholder="Promo (opc.)" value={promo} onChange={(e) => setPromo(e.target.value)} />
          <input type="date" className={input} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Promo vigente hasta" />
        </div>
        <div className="flex items-center gap-3">
          <button
            className={btnPrimary}
            disabled={pending || parseEuros(price) === null || !productId}
            onClick={() =>
              start(async () => {
                try {
                  await addPriceAction({
                    productId: Number(productId),
                    priceCents: parseEuros(price) as number,
                    promoPriceCents: promo.trim() === "" ? null : parseEuros(promo),
                    validUntil: until === "" ? null : until,
                    confirmed: true,
                  });
                  setPrice("");
                  setPromo("");
                  setUntil("");
                  setMsg("Precio guardado como confirmado");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Error");
                }
              })
            }
          >
            Guardar precio
          </button>
          {msg && <span className="text-sm text-stone-600 dark:text-stone-300">{msg}</span>}
        </div>
      </div>

      <div className="grid gap-3">
        <p className="text-sm font-medium">Importar precios desde CSV</p>
        <p className="break-all rounded-lg bg-stone-100 p-2 font-mono text-[11px] dark:bg-stone-800">{csvHeader}</p>
        <p className="text-xs text-stone-500">
          tienda: esselunga o iper · unidad: g, ml o unit · precios con punto o coma · al_peso: si/no. Las filas con error se informan sin frenar el resto.
        </p>
        <textarea className={`${input} font-mono text-xs`} rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={csvHeader} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={btnSecondary}
            disabled={pending || csv.trim() === ""}
            onClick={() =>
              start(async () => {
                try {
                  setCsvResult(await importPricesCsvAction(csv));
                } catch (e) {
                  setCsvResult({ imported: 0, errors: [e instanceof Error ? e.message : "Error"] });
                }
              })
            }
          >
            Importar
          </button>
          <label className="text-sm text-stone-500">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
          </label>
        </div>
        {csvResult && (
          <div className="text-sm">
            <p className="font-medium">{csvResult.imported} fila(s) importadas.</p>
            {csvResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-red-600">
                {csvResult.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
