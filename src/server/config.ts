/** URL de la base: DATABASE_URL, o TURSO_DATABASE_URL (la inyecta la integracion de Turso en Vercel). */
export function databaseUrl(): string {
  return process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:./data/app.db";
}

export function databaseToken(): string | undefined {
  return process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
}

/**
 * Faltantes que impiden usar la app en produccion. En local (dev/test) no hay requisitos.
 * En Vercel el disco es efimero y de solo lectura: un archivo SQLite no sirve.
 */
export function configProblems(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!process.env.APP_PASSWORD) problems.push("APP_PASSWORD (la clave de acceso)");
  if (process.env.VERCEL && databaseUrl().startsWith("file:")) {
    problems.push("DATABASE_URL y DATABASE_AUTH_TOKEN (una base libSQL/Turso)");
  }
  return problems;
}
