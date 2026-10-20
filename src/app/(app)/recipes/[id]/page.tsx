import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { recipes as recipesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Badge, Card, PageHeader, SLOT_LABEL } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { formatQuantity } from "@/lib/units";
import { loadCatalog } from "@/server/catalog";
import { recipeCard } from "@/server/queries";
import { PrefButtons } from "./pref-buttons";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) notFound();
  const data = await loadCatalog();
  const recipe = data.recipes.get(rid);
  if (!recipe) notFound();
  const [row] = await getDb().select().from(recipesTable).where(eq(recipesTable.id, rid));
  const card = recipeCard(data, rid, todayISO())!;
  const steps = row.instructions.split("\n").filter(Boolean);

  return (
    <>
      <Link href="/recipes" className="mb-3 inline-block text-sm text-stone-500">
        ← Todas las recetas
      </Link>
      <PageHeader title={recipe.name} subtitle={`${SLOT_LABEL[recipe.mealType]} · ${recipe.minutes} min · ${recipe.servings} porcion`} />

      {row.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.imageUrl}
          alt={recipe.name}
          referrerPolicy="no-referrer"
          className="mb-4 max-h-64 w-full rounded-2xl object-cover"
        />
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge>{card.costUnknown > 0 ? `~${formatEUR(card.costCents)}*` : formatEUR(card.costCents)} por porcion</Badge>
        <Badge>
          {Math.round(card.nutrition.kcal)} kcal{!card.nutrition.complete && "*"}
        </Badge>
        <Badge>{Math.round(card.nutrition.protein)} g proteina</Badge>
        <Badge>{Math.round(card.nutrition.carbs)} g carbohidratos</Badge>
        <Badge>{Math.round(card.nutrition.fat)} g grasa</Badge>
        <Badge tone="warn">Valores nutricionales estimados</Badge>
      </div>
      {(card.costUnknown > 0 || !card.nutrition.complete) && (
        <p className="mb-4 text-xs text-stone-500">
          * Faltan precios o datos nutricionales de algun ingrediente: el valor mostrado es parcial.
        </p>
      )}

      <Card className="mb-4">
        <h2 className="mb-2 font-semibold">Ingredientes</h2>
        <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
          {recipe.ingredients.map((ri) => {
            const ing = data.ingredients.get(ri.ingredientId);
            return (
              <li key={ri.ingredientId} className="flex justify-between py-1.5">
                <span>{ing?.name}</span>
                <span className="text-stone-500">
                  {ing ? formatQuantity(ri.quantity, ing.baseUnit) : ri.quantity}
                  {data.staples.has(ri.ingredientId) && " (siempre en casa)"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 font-semibold">Preparacion</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          {steps.map((st, i) => (
            <li key={i}>{st.replace(/^\d+\.\s*/, "")}</li>
          ))}
        </ol>
      </Card>

      <PrefButtons recipeId={rid} pref={card.pref} />
    </>
  );
}
