/**
 * Corre una vez al arrancar el servidor, antes de atender pedidos: aplica las migraciones y los datos
 * iniciales. Asi la primera visita tras un despliegue no compite con la migracion.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configProblems } = await import("./server/config");
  if (configProblems().length > 0) return;
  try {
    const { ensureDb } = await import("./server/bootstrap");
    await ensureDb();
  } catch (e) {
    console.error("No se pudo preparar la base al arrancar:", e);
  }
}
