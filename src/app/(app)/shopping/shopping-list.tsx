"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  Badge,
  CATEGORY_LABEL,
  PageHeader,
  ProgressBar,
  btnPrimary,
  btnSecondary,
  input,
} from "@/components/ui";
import { productLabel } from "@/lib/labels";
import { formatEUR, parseEuros } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import type { ItemView } from "@/server/queries";
import {
  addManualItemAction,
  confirmShelfPriceAction,
  finishShoppingAction,
  removeItemAction,
  reopenListAction,
  restoreItemAction,
  setStrategyAction,
  toggleItemAction,
  updateItemAction,
} from "@/server/actions";

type Props = {
  listId: number;
  status: "open" | "done";
  strategy: "esselunga" | "iper" | "split";
  actualTotalCents: number | null;
  budgetCents: number;
  planLabel: string;
  stores: { slug: string; name: string }[];
  items: ItemView[];
};

type ToggleOp = { itemId: number; checked: boolean };
const QUEUE_KEY = "mp_toggle_queue_v1";

const queueListeners = new Set<() => void>();
let memoryQueue = "[]";

function readRaw(): string {
  try {
    return localStorage.getItem(QUEUE_KEY) ?? memoryQueue;
  } catch {
    return memoryQueue;
  }
}
function parseQueue(raw: string): ToggleOp[] {
  try {
    return JSON.parse(raw) as ToggleOp[];
  } catch {
    return [];
  }
}
function readQueue(): ToggleOp[] {
  return parseQueue(readRaw());
}
function writeQueue(q: ToggleOp[]) {
  const raw = JSON.stringify(q);
  memoryQueue = raw;
  try {
    localStorage.setItem(QUEUE_KEY, raw);
  } catch {
    /* almacenamiento no disponible: la cola vive solo en memoria */
  }
  queueListeners.forEach((l) => l());
}
function subscribeQueue(cb: () => void) {
  queueListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    queueListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function quantityLabel(it: ItemView): string {
  const p = it.product;
  if (p && !p.soldByWeight && p.packUnit === it.unit) {
    const packs = Math.max(1, Math.ceil(it.toBuyQty / p.packSize - 1e-9));
    return `${packs} × ${formatQuantity(p.packSize, p.packUnit)}`;
  }
  return formatQuantity(it.toBuyQty, it.unit);
}

function PriceChip({ it }: { it: ItemView }) {
  if (it.realPriceCents !== null) return <Badge tone="good">Pagado {formatEUR(it.realPriceCents)}</Badge>;
  if (it.estPriceCents === null) return <Badge tone="warn">Sin precio</Badge>;
  if (it.priceStatus === "confirmed") return <Badge tone="good">{formatEUR(it.estPriceCents)} confirmado</Badge>;
  const stale = it.priceInfo?.freshness === "stale";
  return (
    <Badge tone="warn">
      ≈ {formatEUR(it.estPriceCents)} {stale ? "desactualizado" : "estimado"}
    </Badge>
  );
}

export function ShoppingList(props: Props) {
  const [serverItems, setServerItems] = useState(props.items);
  const [prevItems, setPrevItems] = useState(props.items);
  if (props.items !== prevItems) {
    setPrevItems(props.items);
    setServerItems(props.items);
  }
  const rawQueue = useSyncExternalStore(subscribeQueue, readRaw, () => "[]");
  const queue = useMemo(() => parseQueue(rawQueue), [rawQueue]);
  const [shopMode, setShopMode] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const flushing = useRef(false);

  const items = useMemo(() => {
    const overlay = new Map(queue.map((op) => [op.itemId, op.checked]));
    return serverItems.map((i) => (overlay.has(i.id) ? { ...i, checked: overlay.get(i.id)! } : i));
  }, [serverItems, queue]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let q = readQueue();
      while (q.length > 0) {
        const op = q[0];
        try {
          await toggleItemAction(op);
          setServerItems((prev) => prev.map((i) => (i.id === op.itemId ? { ...i, checked: op.checked } : i)));
        } catch {
          setError(`Sin conexion: ${q.length} cambio(s) guardados en el telefono. Se reintentara solo.`);
          return;
        }
        q = readQueue().filter((o) => !(o.itemId === op.itemId && o.checked === op.checked));
        writeQueue(q);
      }
      setError(null);
    } finally {
      flushing.current = false;
    }
  }, []);

  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void flush(), 15000);
    void flush();
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [flush]);

  const toggle = (it: ItemView) => {
    const op = { itemId: it.id, checked: !it.checked };
    const next = [...readQueue().filter((o) => o.itemId !== it.id), op];
    writeQueue(next);
    void flush();
  };

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        setError(null);
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el cambio");
      }
    });

  const active = items.filter((i) => !i.removed && i.toBuyQty > 0);
  const removed = items.filter((i) => i.removed);
  const pendingItems = active.filter((i) => !i.checked);
  const boughtItems = active.filter((i) => i.checked);

  const estimated = active.reduce((s, i) => s + (i.estPriceCents ?? 0), 0);
  const unknown = active.filter((i) => i.estPriceCents === null).length;
  const boughtEstimated = boughtItems.reduce((s, i) => s + (i.realPriceCents ?? i.estPriceCents ?? 0), 0);
  const realRecorded = boughtItems.reduce((s, i) => s + (i.realPriceCents ?? 0), 0);
  const progress = active.length === 0 ? 0 : Math.round((boughtItems.length / active.length) * 100);
  const diff = estimated - props.budgetCents;
  const done = props.status === "done";

  const groupMap = new Map<string, ItemView[]>();
  for (const it of pendingItems) groupMap.set(it.category, [...(groupMap.get(it.category) ?? []), it]);
  const categoryOrder = Object.keys(CATEGORY_LABEL);
  const groups = [...groupMap.entries()].sort(
    (a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]),
  );

  return (
    <>
      <PageHeader
        title="Lista de compras"
        subtitle={props.planLabel}
        actions={
          <button className={shopMode ? btnPrimary : btnSecondary} onClick={() => setShopMode((m) => !m)}>
            {shopMode ? "Salir del modo compra" : "Modo compra"}
          </button>
        }
      />

      {error && (
        <div role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </div>
      )}
      {queue.length > 0 && !error && (
        <div className="mb-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          Sincronizando {queue.length} cambio(s)...
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-stone-500">
            {boughtItems.length} de {active.length} comprados
          </p>
          <p className="text-sm font-semibold">{progress}%</p>
        </div>
        <div className="mt-2">
          <ProgressBar value={progress} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-[11px] text-stone-500">Total estimado</dt>
            <dd className="text-lg font-bold">{formatEUR(estimated)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone-500">Ya en el carro</dt>
            <dd className="text-lg font-bold">{formatEUR(boughtEstimated)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-stone-500">Pagado registrado</dt>
            <dd className="text-lg font-bold">{formatEUR(realRecorded)}</dd>
          </div>
        </dl>
        <p className={`mt-3 text-xs ${diff > 0 ? "text-red-600" : "text-stone-500"}`}>
          Presupuesto {formatEUR(props.budgetCents)} ·{" "}
          {diff > 0 ? `excedido por ${formatEUR(diff)}` : `margen ${formatEUR(-diff)}`}
          {unknown > 0 && ` · ${unknown} sin precio (no suman)`}
        </p>
      </div>

      {!shopMode && !done && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-stone-500">Comprar en</span>
            <select
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
              value={props.strategy}
              onChange={(e) =>
                run(() => setStrategyAction({ listId: props.listId, strategy: e.target.value as Props["strategy"] }))
              }
            >
              {props.stores.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
              <option value="split">Dividir entre tiendas</option>
            </select>
          </label>
          <button className={btnSecondary} onClick={() => setShowAdd((a) => !a)}>
            + Agregar producto
          </button>
        </div>
      )}

      {showAdd && !shopMode && <AddForm listId={props.listId} run={run} onDone={() => setShowAdd(false)} />}

      {done && (
        <div className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Compra terminada. Gasto real registrado:{" "}
          <strong>{props.actualTotalCents === null ? "no indicado" : formatEUR(props.actualTotalCents)}</strong> (estimado{" "}
          {formatEUR(estimated)}).
          <button className="ml-3 underline" onClick={() => run(() => reopenListAction(props.listId))}>
            Reabrir
          </button>
        </div>
      )}

      {active.length === 0 && <p className="text-sm text-stone-500">No hay productos para comprar en este plan.</p>}

      <div className="flex flex-col gap-6">
        {groups.map(([cat, list]) => (
          <section key={cat}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{CATEGORY_LABEL[cat]}</h2>
            <ul className="flex flex-col gap-2">
              {list.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  big={shopMode}
                  open={openId === it.id}
                  onOpen={() => setOpenId(openId === it.id ? null : it.id)}
                  onToggle={() => toggle(it)}
                  run={run}
                  disabled={done}
                />
              ))}
            </ul>
          </section>
        ))}

        {boughtItems.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Comprados ({boughtItems.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {boughtItems.map((it) => (
                <Row
                  key={it.id}
                  it={it}
                  big={shopMode}
                  open={openId === it.id}
                  onOpen={() => setOpenId(openId === it.id ? null : it.id)}
                  onToggle={() => toggle(it)}
                  run={run}
                  disabled={done}
                />
              ))}
            </ul>
          </section>
        )}

        {removed.length > 0 && !shopMode && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Eliminados</h2>
            <ul className="flex flex-col gap-1">
              {removed.map((it) => (
                <li key={it.id} className="flex items-center justify-between text-sm text-stone-500">
                  <span className="line-through">{it.name}</span>
                  <button className="text-emerald-700 underline dark:text-emerald-400" onClick={() => run(() => restoreItemAction(it.id))}>
                    Restaurar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {!done && active.length > 0 && (
        <div className="mt-8">
          {showFinish ? (
            <FinishForm
              listId={props.listId}
              estimated={estimated}
              recorded={realRecorded}
              run={run}
              onDone={() => setShowFinish(false)}
            />
          ) : (
            <button className={`${btnPrimary} w-full`} onClick={() => setShowFinish(true)}>
              Termine la compra
            </button>
          )}
        </div>
      )}
      {pending && <span className="sr-only">Guardando</span>}
    </>
  );
}

function Row({
  it,
  big,
  open,
  onOpen,
  onToggle,
  run,
  disabled,
}: {
  it: ItemView;
  big: boolean;
  open: boolean;
  onOpen: () => void;
  onToggle: () => void;
  run: (fn: () => Promise<unknown>) => void;
  disabled: boolean;
}) {
  return (
    <li
      className={`rounded-2xl border bg-white dark:bg-stone-900 ${
        it.checked ? "border-stone-200 opacity-60 dark:border-stone-800" : "border-stone-200 dark:border-stone-700"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={it.checked ? `Desmarcar ${it.name}` : `Marcar ${it.name} como comprado`}
          aria-pressed={it.checked}
          className={`grid shrink-0 place-items-center rounded-xl border-2 transition active:scale-95 ${
            big ? "h-14 w-14" : "h-11 w-11"
          } ${
            it.checked
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-stone-300 text-transparent dark:border-stone-600"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className={`${big ? "text-lg" : "text-base"} font-medium leading-snug ${it.checked ? "line-through" : ""}`}>
            {it.name}
          </p>
          <p className="text-sm text-stone-500">
            {quantityLabel(it)}
            {!big && it.pantryQty > 0 && ` · tenes ${formatQuantity(it.pantryQty, it.unit)}`}
          </p>
          {!big && it.product && (
            <p className="truncate text-xs text-stone-400">
              {it.product.storeName} · {productLabel(it.product.brand, it.product.name)}
            </p>
          )}
        </button>
        <div className="shrink-0 text-right">
          <PriceChip it={it} />
        </div>
      </div>
      {open && !big && <RowEditor it={it} run={run} disabled={disabled} />}
    </li>
  );
}

function RowEditor({
  it,
  run,
  disabled,
}: {
  it: ItemView;
  run: (fn: () => Promise<unknown>) => void;
  disabled: boolean;
}) {
  const [qty, setQty] = useState(String(Math.round(it.toBuyQty * 100) / 100));
  const [est, setEst] = useState(it.estPriceCents === null ? "" : (it.estPriceCents / 100).toFixed(2));
  const [real, setReal] = useState(it.realPriceCents === null ? "" : (it.realPriceCents / 100).toFixed(2));
  const [shelf, setShelf] = useState("");

  const f = "text-xs text-stone-500";
  return (
    <div className="grid gap-3 border-t border-stone-100 p-3 text-sm dark:border-stone-800">
      {it.priceInfo && (
        <p className="text-xs text-stone-500">
          Precio de referencia: {it.priceInfo.isEstimate ? "estimacion no verificada" : it.priceInfo.confirmedByUser ? "confirmado por vos" : "fuente publica"}
          {it.priceInfo.isPromo && " · promo vigente"} · {it.priceInfo.observedAt}
          {it.priceInfo.sourceRef && ` · ${it.priceInfo.sourceRef}`}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <label>
          <span className={f}>Cantidad ({it.unit === "unit" ? "u" : it.unit})</span>
          <input className={input} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          <span className={f}>Precio estimado</span>
          <input className={input} inputMode="decimal" value={est} onChange={(e) => setEst(e.target.value)} placeholder="—" />
        </label>
        <label>
          <span className={f}>Pagado real</span>
          <input className={input} inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} placeholder="—" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={btnPrimary}
          disabled={disabled}
          onClick={() =>
            run(() =>
              updateItemAction({
                itemId: it.id,
                toBuyQty: Number(qty.replace(",", ".")) >= 0 ? Number(qty.replace(",", ".")) : undefined,
                estPriceCents: est.trim() === "" ? null : (parseEuros(est) ?? undefined),
                realPriceCents: real.trim() === "" ? null : (parseEuros(real) ?? undefined),
              }),
            )
          }
        >
          Guardar
        </button>
        <button
          className="rounded-xl px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          disabled={disabled}
          onClick={() => run(() => removeItemAction(it.id))}
        >
          Eliminar de la lista
        </button>
      </div>
      {it.product && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className={f}>
              Precio visto en el estante ({it.product.soldByWeight ? "por kg/unidad" : "por envase"})
            </span>
            <input className={input} inputMode="decimal" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="ej. 2.49" />
          </label>
          <button
            className={btnSecondary}
            disabled={disabled || parseEuros(shelf) === null}
            onClick={() => {
              const cents = parseEuros(shelf);
              if (cents !== null) run(() => confirmShelfPriceAction({ itemId: it.id, priceCents: cents }));
            }}
          >
            Confirmar precio
          </button>
        </div>
      )}
    </div>
  );
}

function AddForm({
  listId,
  run,
  onDone,
}: {
  listId: number;
  run: (fn: () => Promise<unknown>) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"g" | "ml" | "unit">("unit");
  const [category, setCategory] = useState("otros");
  const [price, setPrice] = useState("");
  return (
    <div className="mb-5 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
      <input className={input} placeholder="Producto" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <input className={input} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Cantidad" />
        <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} aria-label="Unidad">
          <option value="unit">unidades</option>
          <option value="g">gramos</option>
          <option value="ml">ml</option>
        </select>
        <input className={input} inputMode="decimal" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <select className={input} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
        {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <button
        className={btnPrimary}
        disabled={name.trim() === "" || !(Number(qty.replace(",", ".")) >= 0)}
        onClick={() =>
          run(async () => {
            await addManualItemAction({
              listId,
              name,
              quantity: Number(qty.replace(",", ".")),
              unit,
              category: category as never,
              priceCents: price.trim() === "" ? null : parseEuros(price),
            });
            onDone();
          })
        }
      >
        Agregar
      </button>
    </div>
  );
}

function FinishForm({
  listId,
  estimated,
  recorded,
  run,
  onDone,
}: {
  listId: number;
  estimated: number;
  recorded: number;
  run: (fn: () => Promise<unknown>) => void;
  onDone: () => void;
}) {
  const [total, setTotal] = useState(recorded > 0 ? (recorded / 100).toFixed(2) : "");
  const cents = total.trim() === "" ? null : parseEuros(total);
  return (
    <div className="grid gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
      <p className="text-sm">
        Total del ticket (opcional). Estimado de la lista: <strong>{formatEUR(estimated)}</strong>. Al terminar, lo comprado se suma a la despensa (una sola vez).
      </p>
      <input className={input} inputMode="decimal" placeholder="Total pagado, ej. 31.40" value={total} onChange={(e) => setTotal(e.target.value)} />
      <div className="flex gap-2">
        <button
          className={btnPrimary}
          disabled={total.trim() !== "" && cents === null}
          onClick={() =>
            run(async () => {
              await finishShoppingAction({ listId, actualTotalCents: cents });
              onDone();
            })
          }
        >
          Confirmar y actualizar despensa
        </button>
        <button className={btnSecondary} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
