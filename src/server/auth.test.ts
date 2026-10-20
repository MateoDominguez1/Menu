import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "mp_session" && cookieValue ? { value: cookieValue } : undefined) }),
}));

const env = { ...process.env };
beforeEach(() => {
  cookieValue = undefined;
  process.env.APP_PASSWORD = "secreta";
  process.env.APP_SECRET = "otra-clave-larga-para-firmar";
});
afterEach(() => {
  process.env = { ...env };
});

describe("acceso por clave", () => {
  it("sin APP_PASSWORD la app queda abierta (uso local)", async () => {
    delete process.env.APP_PASSWORD;
    const { isAuthenticated, requireAuth } = await import("./auth");
    expect(await isAuthenticated()).toBe(true);
    await expect(requireAuth()).resolves.toBeUndefined();
  });

  it("en produccion sin clave configurada falla cerrado: nada es accesible", async () => {
    delete process.env.APP_PASSWORD;
    vi.stubEnv("NODE_ENV", "production");
    const { isAuthenticated, requireAuth } = await import("./auth");
    expect(await isAuthenticated()).toBe(false);
    await expect(requireAuth()).rejects.toThrow("No autorizado");
    vi.unstubAllEnvs();
  });

  it("rechaza las acciones sin sesion valida", async () => {
    const { requireAuth } = await import("./auth");
    await expect(requireAuth()).rejects.toThrow("No autorizado");
    cookieValue = "token-falso";
    await expect(requireAuth()).rejects.toThrow("No autorizado");
  });

  it("acepta la sesion firmada correcta", async () => {
    const { requireAuth, sessionToken } = await import("./auth");
    cookieValue = sessionToken();
    await expect(requireAuth()).resolves.toBeUndefined();
  });

  it("el token cambia si cambia la clave o el secreto", async () => {
    const { sessionToken } = await import("./auth");
    const a = sessionToken();
    process.env.APP_PASSWORD = "otra";
    expect(sessionToken()).not.toBe(a);
  });

  it("compara la clave sin aceptar prefijos ni vacios", async () => {
    const { passwordMatches } = await import("./auth");
    expect(passwordMatches("secreta")).toBe(true);
    expect(passwordMatches("secret")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("el proxy redirige a /login cuando no hay cookie, salvo en /login", async () => {
    const { proxy } = await import("../proxy");
    const res = proxy(new NextRequest("http://localhost:3000/shopping"));
    expect(res.headers.get("location")).toContain("/login");
    const login = proxy(new NextRequest("http://localhost:3000/login"));
    expect(login.headers.get("location")).toBeNull();
    const withCookie = proxy(
      new NextRequest("http://localhost:3000/shopping", { headers: { cookie: "mp_session=abc" } }),
    );
    expect(withCookie.headers.get("location")).toBeNull();
  });
});
