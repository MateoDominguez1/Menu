import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as s from "@/db/schema";
import { Card, PageHeader } from "@/components/ui";
import { productLabel } from "@/lib/labels";
import { loadCatalog } from "@/server/catalog";
import { CSV_HEADER } from "@/server/csv-prices";
import { PRICE_SOURCES } from "@/server/price-sources";
import { authEnabled } from "@/server/auth";
import { LogoutButton } from "./logout-button";
import { PricesPanel } from "./prices-panel";
import { ProfileForm } from "./profile-form";
import { RulesPanel } from "./rules-panel";

export default async function SettingsPage() {
  const db = getDb();
  const [data, rules] = await Promise.all([
    loadCatalog(),
    db.select().from(s.profileRules).orderBy(asc(s.profileRules.kind), asc(s.profileRules.value)),
  ]);
  const p = data.profile;
  const products = [...data.products.values()]
    .map((pr) => ({
      id: pr.id,
      label: `${data.stores.find((st) => st.id === pr.storeId)?.name} · ${productLabel(pr.brand, pr.name)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const aiConfigured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Todo lo de aca es configurable: nada es un requisito fijo." />
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-3 font-semibold">Perfil y objetivos</h2>
          <ProfileForm
            initial={{
              weeklyBudgetCents: p.weeklyBudgetCents,
              goal: p.goal,
              kcalTarget: p.kcalTarget,
              proteinTargetG: p.proteinTargetG,
              cookMinutesPerMeal: p.cookMinutesPerMeal,
              fridgeLimited: p.fridgeLimited,
              planBreakfast: p.planBreakfast,
              planLunch: p.planLunch,
              planDinner: p.planDinner,
              planSnacks: p.planSnacks,
              mealPrepRequired: p.mealPrepRequired,
              travelCostCents: p.travelCostCents,
              timePenaltyCents: p.timePenaltyCents,
              notes: p.notes,
            }}
          />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Alergias, restricciones y alimentos</h2>
          <p className="mb-3 text-xs text-stone-500">
            &quot;Evitar&quot; y &quot;alergia&quot; excluyen recetas. &quot;Siempre en casa&quot; saca el ingrediente de la lista de compras (ej. aceite, condimentos).
          </p>
          <RulesPanel rules={rules} />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Precios de supermercados</h2>
          <p className="mb-3 text-xs text-stone-500">
            No hay acceso automatico a precios en vivo de Esselunga ni de Iper. Se cargan a mano o por CSV, y cada precio guarda su origen y fecha.
          </p>
          <ul className="mb-4 grid gap-2">
            {PRICE_SOURCES.map((src) => (
              <li key={src.id} className="rounded-xl border border-stone-200 p-3 text-sm dark:border-stone-700">
                <p className="font-medium">
                  {src.label}{" "}
                  <span className={src.status === "available" ? "text-emerald-700" : "text-stone-400"}>
                    · {src.status === "available" ? "disponible" : "no disponible"}
                  </span>
                </p>
                <p className="text-xs text-stone-500">{src.note}</p>
              </li>
            ))}
          </ul>
          <PricesPanel
            products={products}
            csvHeader={CSV_HEADER}
            stores={data.stores.map((st) => ({ id: st.id, name: st.name }))}
            ingredients={[...data.ingredients.values()]
              .sort((a, b) => a.name.localeCompare(b.name, "es"))
              .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }))}
          />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Generacion con IA</h2>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {aiConfigured
              ? "Hay una clave configurada en el servidor."
              : "No hay clave configurada: la app usa el motor local con las recetas guardadas (funciona igual)."}
          </p>
        </Card>

        {authEnabled() && (
          <Card>
            <LogoutButton />
          </Card>
        )}
      </div>
    </>
  );
}
