import { getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { applyReferenceData, seedDatabase } from "@/db/seed";
import { databaseToken, databaseUrl } from "./config";

const g = globalThis as unknown as { __dbReady?: Promise<void> };

/** Aplica migraciones y carga datos iniciales la primera vez. Idempotente. */
export function ensureDb(): Promise<void> {
  if (!g.__dbReady) {
    g.__dbReady = (async () => {
      await runMigrations(databaseUrl(), databaseToken());
      await seedDatabase(getDb());
      await applyReferenceData(getDb());
    })().catch((e) => {
      g.__dbReady = undefined;
      throw e;
    });
  }
  return g.__dbReady;
}
