import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "mp_session";

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

/** Sin clave configurada: abierta en desarrollo, cerrada en produccion (falla cerrado). */
function openWithoutPassword(): boolean {
  return process.env.NODE_ENV !== "production";
}

function secret(): string {
  return process.env.APP_SECRET || "dev-secret-change-me";
}

export function sessionToken(): string {
  return createHmac("sha256", secret()).update(process.env.APP_PASSWORD ?? "").digest("hex");
}

export function passwordMatches(input: string): boolean {
  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  const given = Buffer.from(input);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authEnabled()) return openWithoutPassword();
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value ?? "";
  const expected = sessionToken();
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Debe llamarse al inicio de cada Server Action: las acciones se pueden invocar por POST directo. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("No autorizado");
}
