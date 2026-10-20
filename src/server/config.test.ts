import { afterEach, describe, expect, it, vi } from "vitest";
import { configProblems, databaseToken, databaseUrl } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuracion", () => {
  it("en desarrollo no exige nada", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_PASSWORD", "");
    expect(configProblems()).toEqual([]);
  });

  it("en produccion exige clave de acceso", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", "");
    expect(configProblems().join()).toContain("APP_PASSWORD");
  });

  it("en Vercel no acepta un archivo SQLite local", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_PASSWORD", "x");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    expect(configProblems().join()).toContain("DATABASE_URL");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://mi-base.turso.io");
    expect(configProblems()).toEqual([]);
  });

  it("acepta las variables de la integracion de Turso como alternativa", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://mi-base.turso.io");
    vi.stubEnv("DATABASE_AUTH_TOKEN", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "tok");
    expect(databaseUrl()).toBe("libsql://mi-base.turso.io");
    expect(databaseToken()).toBe("tok");
  });

  it("DATABASE_URL tiene prioridad", () => {
    vi.stubEnv("DATABASE_URL", "libsql://a");
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://b");
    expect(databaseUrl()).toBe("libsql://a");
  });
});
