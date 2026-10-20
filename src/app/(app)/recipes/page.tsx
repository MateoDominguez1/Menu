import Link from "next/link";
import { Badge, Card, PageHeader, SLOT_LABEL, btnPrimary } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { loadCatalog } from "@/server/catalog";
import { recipeCard } from "@/server/queries";

export default async function RecipesPage() {
  const data = await loadCatalog();
  const today = todayISO();
  const cards = [...data.recipes.keys()]
    .map((id) => recipeCard(data, id, today)!)
    .sort((a, b) => a.mealType.localeCompare(b.mealType) || a.name.localeCompare(b.name, "es"));

  return (
    <>
      <PageHeader
        title="Recetas"
        subtitle={`${cards.length} recetas`}
        actions={
          <Link href="/recipes/new" className={btnPrimary}>
            + Nueva receta
          </Link>
        }
      />
      <div className="flex flex-col gap-2">
        {cards.map((c) => (
          <Link key={c.id} href={`/recipes/${c.id}`}>
            <Card className="!p-3 transition hover:border-emerald-600">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-stone-500">
                    {SLOT_LABEL[c.mealType]} · {c.minutes} min · {c.costUnknown > 0 ? "~" : ""}
                    {formatEUR(c.costCents)}/porcion
                  </p>
                </div>
                <div className="flex gap-1">
                  {c.auto && <Badge tone="info">Segun ofertas</Badge>}
                  {c.pref === "favorite" && <Badge tone="good">Favorita</Badge>}
                  {c.pref === "discarded" && <Badge tone="bad">Descartada</Badge>}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
