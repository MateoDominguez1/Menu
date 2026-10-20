import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { Badge, Card, CATEGORY_LABEL, Empty, PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { loadCatalog } from "@/server/catalog";
import { PantryEditor } from "./pantry-editor";

const LOCATION_LABEL = { despensa: "Despensa", heladera: "Heladera", congelador: "Congelador" } as const;

export default async function PantryPage() {
  const db = getDb();
  const [rows, data] = await Promise.all([
    db.select().from(s.pantryItems).orderBy(asc(s.pantryItems.name)),
    loadCatalog(),
  ]);
  const today = todayISO();
  const ingredients = [...data.ingredients.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit, category: i.category }));

  return (
    <>
      <PageHeader title="Despensa" subtitle="Lo que tenes en casa. El plan lo usa antes de pedirte comprar." />
      <PantryEditor ingredients={ingredients} rows={rows} />

      <div className="mt-6 flex flex-col gap-6">
        {s.LOCATIONS.map((loc) => {
          const list = rows.filter((r) => r.location === loc);
          return (
            <section key={loc}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {LOCATION_LABEL[loc]} ({list.length})
              </h2>
              {list.length === 0 ? (
                <Empty>Vacio</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {list.map((r) => {
                    const days = r.expiresOn
                      ? Math.round((Date.parse(r.expiresOn) - Date.parse(today)) / 86_400_000)
                      : null;
                    return (
                      <Card key={r.id} className="flex items-center justify-between !p-3">
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-stone-500">{CATEGORY_LABEL[r.category]}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {days !== null && (
                            <Badge tone={days < 0 ? "bad" : days <= 3 ? "warn" : "neutral"}>
                              {days < 0 ? "Vencido" : days === 0 ? "Vence hoy" : `Vence en ${days} d`}
                            </Badge>
                          )}
                          <span className="font-semibold">{formatQuantity(r.quantity, r.unit)}</span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
