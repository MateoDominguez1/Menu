"use client";

import { useTransition } from "react";
import { Badge, btnDanger } from "@/components/ui";
import { deleteOfferImportAction } from "@/server/offer-actions";

export function ImportsList({
  imports,
  today,
}: {
  imports: { id: number; label: string; validUntil: string; count: number }[];
  today: string;
}) {
  const [pending, start] = useTransition();
  if (imports.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-sm font-semibold text-stone-500">Volantinos importados</h2>
      <ul className="flex flex-col gap-2">
        {imports.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-700">
            <div>
              <p className="font-medium">{i.label}</p>
              <p className="text-xs text-stone-500">
                {i.count} productos · vigente hasta {i.validUntil}{" "}
                {i.validUntil < today ? <Badge tone="warn">Vencido</Badge> : <Badge tone="good">Vigente</Badge>}
              </p>
            </div>
            <button
              className={btnDanger}
              disabled={pending}
              onClick={() => {
                if (!confirm("¿Eliminar este volantino y los precios que genero?")) return;
                start(async () => {
                  await deleteOfferImportAction(i.id);
                });
              }}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
