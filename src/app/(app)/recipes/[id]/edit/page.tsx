import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { recipes as recipesTable } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { loadCatalog } from "@/server/catalog";
import { RecipeForm } from "../../recipe-form";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) notFound();
  const data = await loadCatalog();
  const recipe = data.recipes.get(rid);
  if (!recipe) notFound();
  const [row] = await getDb().select().from(recipesTable).where(eq(recipesTable.id, rid));
  const ingredients = [...data.ingredients.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }));
  return (
    <>
      <PageHeader title="Editar receta" subtitle={recipe.name} />
      <RecipeForm
        ingredients={ingredients}
        initial={{
          id: rid,
          name: row.name,
          mealType: row.mealType,
          minutes: row.minutes,
          servings: row.servings,
          instructions: row.instructions,
          imageUrl: row.imageUrl ?? "",
          tags: row.tags,
          rows: recipe.ingredients,
        }}
      />
    </>
  );
}
