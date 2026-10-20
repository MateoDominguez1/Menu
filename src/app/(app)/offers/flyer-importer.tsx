"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Card, btnPrimary, btnSecondary, input } from "@/components/ui";
import { parseFlyerDocument, type FlyerResult } from "@/lib/flyer";
import type { PdfDocLike } from "@/lib/flyer/pdf-items";
import type { OfferStoreSlug, ParsedOffer } from "@/lib/flyer/types";
import { formatEUR, parseEuros } from "@/lib/money";
import { importOffersAction } from "@/server/offer-actions";

type Row = { key: number; include: boolean; offer: ParsedOffer; priceText: string };

const STORE_NAME: Record<OfferStoreSlug, string> = { iper: "Iper La grande i", esselunga: "Esselunga" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function prettyRange(from: string | null, until: string | null): string {
  if (!until) return "";
  const u = new Date(`${until}T00:00:00Z`);
  const f = from ? new Date(`${from}T00:00:00Z`) : null;
  const m = MONTHS[u.getUTCMonth()];
  return f
    ? `${f.getUTCDate()}-${u.getUTCDate()} ${m} ${u.getUTCFullYear()}`
    : `hasta ${u.getUTCDate()} ${m} ${u.getUTCFullYear()}`;
}

export function FlyerImporter({ today }: { today: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<FlyerResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [store, setStore] = useState<OfferStoreSlug | "">("");
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setResult(null);
    setRows([]);
    setStore("");
    setLabel("");
    setFrom("");
    setUntil("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    setMessage(null);
    reset();
    setBusy("Leyendo el PDF en tu navegador...");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = (await pdfjs.getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise) as unknown as PdfDocLike;
      const parsed = await parseFlyerDocument(doc, {
        today,
        onProgress: (done, total) => setBusy(`Analizando paginas (${done}/${total})...`),
      });
      setResult(parsed);
      setStore(parsed.store ?? "");
      setFrom(parsed.validFrom ?? "");
      setUntil(parsed.validUntil ?? "");
      setLabel(parsed.store ? `${STORE_NAME[parsed.store]} ${prettyRange(parsed.validFrom, parsed.validUntil)}`.trim() : "");
      setRows(parsed.offers.map((offer, i) => ({ key: i, include: true, offer, priceText: (offer.priceCents / 100).toFixed(2) })));
      if (parsed.offers.length === 0) {
        setMessage({ ok: false, text: "No se encontraron ofertas legibles en este PDF." });
      }
    } catch (e) {
      setMessage({ ok: false, text: `No se pudo leer el PDF: ${e instanceof Error ? e.message : "error desconocido"}` });
    } finally {
      setBusy(null);
    }
  };

  const included = rows.filter((r) => r.include);
  const invalid = included.filter((r) => parseEuros(r.priceText) === null || r.offer.name.trim() === "").length;

  const doImport = () =>
    start(async () => {
      setMessage(null);
      if (!store) return setMessage({ ok: false, text: "Elige la tienda." });
      if (!until) return setMessage({ ok: false, text: "Falta la fecha de fin de vigencia." });
      try {
        const res = await importOffersAction({
          storeSlug: store,
          label: label.trim() || STORE_NAME[store],
          validFrom: from || null,
          validUntil: until,
          offers: included.map((r) => ({
            ...r.offer,
            store,
            name: r.offer.name.trim(),
            priceCents: parseEuros(r.priceText) as number,
          })),
        });
        setMessage({
          ok: true,
          text: `Importadas ${res.imported} ofertas (${res.duplicates} repetidas omitidas). ${res.linkedToIngredients} se ligaron a ingredientes de tus recetas y ya alimentan la lista y el comparador.`,
        });
        reset();
      } catch (e) {
        setMessage({ ok: false, text: e instanceof Error ? e.message : "No se pudo importar" });
      }
    });

  return (
    <Card>
      <button className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Importar volantino (PDF)
        <span className="text-stone-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Elige el PDF del volantino de Iper La grande i o de Esselunga. Se lee <strong>en tu navegador</strong>: el archivo no se sube; solo se guardan los
            productos que confirmes. Funciona con PDFs con texto (los banners-imagen no se pueden leer).
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={!!busy || pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            className="text-sm"
          />
          {busy && <p className="text-sm text-stone-500" role="status">{busy}</p>}
          {message && (
            <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          {result && rows.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-stone-500">Tienda</span>
                  <select className={input} value={store} onChange={(e) => setStore(e.target.value as OfferStoreSlug)}>
                    <option value="">Elegir...</option>
                    <option value="iper">Iper La grande i</option>
                    <option value="esselunga">Esselunga</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-stone-500">Vigente desde</span>
                  <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-stone-500">Vigente hasta</span>
                  <input type="date" className={input} value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
                <label className="text-sm sm:col-span-4">
                  <span className="mb-1 block text-xs text-stone-500">Nombre del volantino</span>
                  <input className={input} value={label} onChange={(e) => setLabel(e.target.value)} />
                </label>
              </div>

              <ul className="list-disc space-y-1 pl-5 text-xs text-stone-500">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="good">{rows.length} ofertas leidas</Badge>
                <Badge>{included.length} seleccionadas</Badge>
                <button className={btnSecondary} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: true })))}>Marcar todas</button>
                <button className={btnSecondary} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, include: false })))}>Desmarcar todas</button>
              </div>

              <div className="max-h-[28rem] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-stone-100 dark:bg-stone-800">
                    <tr>
                      <th className="p-2"> </th>
                      <th className="p-2">Pag.</th>
                      <th className="p-2">Producto</th>
                      <th className="p-2">Precio €</th>
                      <th className="p-2">Habitual</th>
                      <th className="p-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className={`border-t border-stone-100 dark:border-stone-800 ${r.include ? "" : "opacity-40"}`}>
                        <td className="p-2">
                          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={r.include} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, include: e.target.checked } : x)))} aria-label={`Incluir ${r.offer.name}`} />
                        </td>
                        <td className="p-2 text-stone-500">{r.offer.page}</td>
                        <td className="min-w-48 p-2">
                          <input
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 hover:border-stone-300 focus:border-emerald-600 focus:outline-none dark:hover:border-stone-600"
                            value={r.offer.name}
                            onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, offer: { ...x.offer, name: e.target.value } } : x)))}
                          />
                          {r.offer.brand && <span className="text-stone-500">{r.offer.brand}</span>}
                        </td>
                        <td className="p-2">
                          <input
                            className={`w-16 rounded-md border px-1 py-0.5 ${parseEuros(r.priceText) === null ? "border-red-500" : "border-stone-300 dark:border-stone-600"} bg-transparent`}
                            inputMode="decimal"
                            value={r.priceText}
                            onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, priceText: e.target.value } : x)))}
                          />
                          {r.offer.perKg && <span className="ml-1 text-stone-500">/kg</span>}
                        </td>
                        <td className="p-2 text-stone-500">{r.offer.regularCents ? formatEUR(r.offer.regularCents) : "—"}</td>
                        <td className="p-2 text-stone-500">
                          {[r.offer.discountPct ? `-${r.offer.discountPct}%` : null, r.offer.needsCard ? "tarjeta" : null, r.offer.packSize ? `${r.offer.packSize} ${r.offer.packUnit === "unit" ? "u" : r.offer.packUnit}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button className={btnPrimary} disabled={pending || included.length === 0 || invalid > 0 || !store || !until} onClick={doImport}>
                  {pending ? "Importando..." : `Importar ${included.length} ofertas`}
                </button>
                <button className={btnSecondary} onClick={reset} disabled={pending}>Cancelar</button>
                {invalid > 0 && <span className="text-xs text-red-600">{invalid} fila(s) con precio o nombre invalido</span>}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
