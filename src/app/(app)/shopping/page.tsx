import Link from "next/link";
import { Empty, PageHeader, btnPrimary } from "@/components/ui";
import { getActivePlan, getListView } from "@/server/queries";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const { plan } = await getActivePlan(sp.plan ? Number(sp.plan) : null);
  if (!plan) {
    return (
      <>
        <PageHeader title="Lista de compras" />
        <Empty>
          Primero genera un plan de comidas.
          <br />
          <Link href="/plan" className={`${btnPrimary} mt-4`}>
            Ir al plan
          </Link>
        </Empty>
      </>
    );
  }
  const { list, items, data } = await getListView(plan.id);
  return (
    <ShoppingList
      listId={list.id}
      status={list.status}
      strategy={list.strategy}
      actualTotalCents={list.actualTotalCents}
      budgetCents={plan.budgetCents}
      planLabel={`${plan.weekStart} (${plan.days} dias)`}
      stores={data.stores.map((s) => ({ slug: s.slug, name: s.name }))}
      items={items}
    />
  );
}
