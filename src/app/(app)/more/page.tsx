import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

const links = [
  { href: "/compare", title: "Comparar tiendas", desc: "Esselunga vs Iper para tu lista actual" },
  { href: "/recipes", title: "Recetas", desc: "Ver, crear y editar recetas" },
  { href: "/pantry", title: "Despensa", desc: "Lo que tenes en casa" },
  { href: "/history", title: "Historial", desc: "Semanas anteriores y gasto real" },
  { href: "/settings", title: "Ajustes", desc: "Perfil, presupuesto, restricciones y precios" },
];

export default function More() {
  return (
    <>
      <PageHeader title="Mas" />
      <div className="flex flex-col gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="transition hover:border-emerald-600">
              <p className="font-semibold">{l.title}</p>
              <p className="text-sm text-stone-500">{l.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
