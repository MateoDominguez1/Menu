"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Inicio", icon: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/plan", label: "Plan", icon: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm0 5h16M9 4v16" },
  { href: "/shopping", label: "Compras", icon: "M6 6h15l-2 9H8zM6 6L5 3H2m6 17a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" },
  { href: "/offers", label: "Ofertas", icon: "M20 12l-8 8-9-9V4h7zM7.5 7.5h.01" },
  { href: "/compare", label: "Comparar", icon: "M4 20V10m6 10V4m6 16v-7m6 7H2" },
  { href: "/recipes", label: "Recetas", icon: "M6 3h12a1 1 0 011 1v16l-7-3-7 3V4a1 1 0 011-1z" },
  { href: "/pantry", label: "Despensa", icon: "M4 8l8-5 8 5v12H4zM9 20v-6h6v6" },
  { href: "/history", label: "Historial", icon: "M12 8v5l3 2M21 12a9 9 0 11-3-6.7L21 8m0-5v5h-5" },
  { href: "/settings", label: "Ajustes", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.4 3a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 001.7 1l.4 3h4l.4-3a7.6 7.6 0 001.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const moreRoutes = ["/pantry", "/history", "/settings", "/more", "/recipes", "/compare"];
  const active = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/more"
        ? moreRoutes.some((r) => pathname.startsWith(r))
        : pathname.startsWith(href);
  const mobileItems = [
    ...items.filter((i) => ["/", "/plan", "/shopping", "/offers"].includes(i.href)),
    { href: "/more", label: "Mas", icon: "M5 12h.01M12 12h.01M19 12h.01" },
  ];

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">
            <Icon d={items[2].icon} />
          </span>
          Comidas
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                active(i.href)
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              }`}
            >
              <Icon d={i.icon} />
              {i.label}
            </Link>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95 md:hidden">
        {mobileItems.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              active(i.href) ? "text-emerald-700 dark:text-emerald-400" : "text-stone-500"
            }`}
          >
            <Icon d={i.icon} />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
