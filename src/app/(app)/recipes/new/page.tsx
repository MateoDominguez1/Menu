import { PageHeader } from "@/components/ui";
import { loadCatalog } from "@/server/catalog";
import { RecipeForm } from "../recipe-form";

export default async function NewRecipePage() {
  const data = await loadCatalog();
  const ingredients = [...data.ingredients.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }));
  return (
    <>
      <PageHeader title="Nueva receta" />
      <RecipeForm
        ingredients={ingredients}
        initial={{ name: "", mealType: "dinner", minutes: 20, servings: 1, instructions: "", imageUrl: "", tags: "", rows: [] }}
      />
    </>
  );
}
