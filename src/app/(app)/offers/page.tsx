import { Card, PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { listOffers } from "@/server/offers";
import { FlyerImporter } from "./flyer-importer";
import { ImportsList } from "./imports-list";
import { OffersBrowser } from "./offers-browser";

export default async function OffersPage() {
  const today = todayISO();
  const { rows, imports } = await listOffers(today);
  const expired = imports.filter((i) => i.validUntil < today).length;

  return (
    <>
      <PageHeader
        title="Ofertas"
        subtitle={`${rows.length} productos en oferta vigentes${expired > 0 ? ` · ${expired} volantino(s) vencido(s)` : ""}`}
      />
      <FlyerImporter today={today} />
      {rows.length === 0 ? (
        <Card className="mt-4 text-sm text-stone-500">
          Todavia no hay ofertas cargadas (o ya vencieron). Importa el PDF del volantino de Iper o de Esselunga con el
          boton de arriba: se lee en tu navegador y no se sube a ningun lado.
        </Card>
      ) : (
        <OffersBrowser
          offers={rows.map((o) => ({
            id: o.id,
            storeName: o.storeName,
            name: o.name,
            brand: o.brand,
            category: o.category,
            priceCents: o.priceCents,
            regularCents: o.regularCents,
            discountPct: o.discountPct,
            unitPriceCents: o.unitPriceCents,
            unitPriceLabel: o.unitPriceLabel,
            perKg: o.perKg,
            needsCard: o.needsCard,
            condition: o.condition,
            validUntil: o.validUntil,
            linked: o.ingredientId !== null,
          }))}
        />
      )}
      <ImportsList imports={imports.map((i) => ({ id: i.id, label: i.label, validUntil: i.validUntil, count: i.offerCount }))} today={today} />
    </>
  );
}
