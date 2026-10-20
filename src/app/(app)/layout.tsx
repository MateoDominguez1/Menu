import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { isAuthenticated } from "@/server/auth";
import { ensureDb } from "@/server/bootstrap";
import { configProblems } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const problems = configProblems();
  if (problems.length > 0) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="mb-2 text-2xl font-bold">Falta configurar el servidor</h1>
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">
          La app no abre datos hasta que se definan estas variables de entorno en el despliegue:
        </p>
        <ul className="list-disc pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-stone-500">Mira el README, seccion &quot;Despliegue&quot;.</p>
      </main>
    );
  }
  if (!(await isAuthenticated())) redirect("/login");
  await ensureDb();
  return (
    <div className="min-h-dvh md:pl-56">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10 md:pt-8">{children}</main>
    </div>
  );
}
