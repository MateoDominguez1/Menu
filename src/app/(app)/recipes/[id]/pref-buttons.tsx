"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btnDanger, btnSecondary } from "@/components/ui";
import { setRecipePrefAction } from "@/server/actions";
import { deleteRecipeAction, duplicateRecipeAction } from "@/server/recipe-actions";

export function PrefButtons({
  recipeId,
  pref,
}: {
  recipeId: number;
  pref: "favorite" | "discarded" | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/recipes/${recipeId}/edit`} className={btnSecondary}>
          Editar
        </Link>
        <button
          className={btnSecondary}
          disabled={pending}
          onClick={() =>
            run(async () => {
              const res = await duplicateRecipeAction(recipeId);
              router.push(`/recipes/${res.id}/edit`);
            })
          }
        >
          Duplicar
        </button>
        <button
          className={btnSecondary}
          disabled={pending}
          onClick={() => run(() => setRecipePrefAction({ recipeId, status: pref === "favorite" ? null : "favorite" }))}
        >
          {pref === "favorite" ? "Quitar de favoritas" : "Marcar favorita"}
        </button>
        <button
          className={btnDanger}
          disabled={pending}
          onClick={() => run(() => setRecipePrefAction({ recipeId, status: pref === "discarded" ? null : "discarded" }))}
        >
          {pref === "discarded" ? "Volver a permitir" : "Descartar (no sugerir mas)"}
        </button>
        <button
          className={btnDanger}
          disabled={pending}
          onClick={() =>
            run(async () => {
              if (!confirm("¿Eliminar la receta? Las comidas del plan que la usan quedan sin receta.")) return;
              await deleteRecipeAction(recipeId);
              router.push("/recipes");
            })
          }
        >
          Eliminar
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
