import { PageHeader } from "@/components/ui";
import { aiEnabled } from "@/server/ai";
import { loadCatalog } from "@/server/catalog";
import { RecipeForm } from "../recipe-form";

type Slot = "breakfast" | "lunch" | "dinner" | "snack";
const SLOTS: Slot[] = ["breakfast", "lunch", "dinner", "snack"];

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; entry?: string; slot?: string; back?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadCatalog();
  const ingredients = [...data.ingredients.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit }));
  const entryId = Number(sp.entry);
  // Solo se vuelve a una pagina del plan de la propia app (nunca a otra direccion).
  const back = sp.back && /^\/plan(\?[\w=&%.-]*)?$/.test(sp.back) ? sp.back : "/plan";
  const assign = Number.isInteger(entryId) && entryId > 0 ? { entryId, back } : undefined;
  const slot = SLOTS.find((s) => s === sp.slot) ?? "dinner";
  return (
    <>
      <PageHeader
        title={assign ? "Tu comida para esta ocasion" : "Nueva receta"}
        subtitle={assign ? "Al guardar queda puesta en el plan y sus ingredientes pasan a la lista de compras." : undefined}
      />
      <RecipeForm
        ingredients={ingredients}
        aiAvailable={aiEnabled()}
        assign={assign}
        initial={{
          name: (sp.name ?? "").slice(0, 100),
          mealType: slot,
          minutes: 20,
          servings: 1,
          instructions: "",
          imageUrl: "",
          tags: "",
          rows: [],
        }}
      />
    </>
  );
}
