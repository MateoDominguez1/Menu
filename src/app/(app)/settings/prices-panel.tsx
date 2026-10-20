"use client";

import { useState, useTransition } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";
import { parseEuros } from "@/lib/money";
import { addPriceAction, importPricesCsvAction } from "@/server/actions";

export function PricesPanel({
  products,
  csvHeader,
}: {
  products: { id: number; label: string }[];
  csvHeader: string;
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
