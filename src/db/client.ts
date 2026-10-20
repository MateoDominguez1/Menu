import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { databaseToken, databaseUrl } from "@/server/config";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __libsql?: Client;
  __db?: Db;
};

function ensureLocalDir(url: string) {
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    mkdirSync(dirname(path), { recursive: true });
  }
}

export function createDb(url: string, authToken?: string): { client: Client; db: Db } {
  ensureLocalDir(url);
  const client = createClient({ url, authToken: authToken || undefined });
  return { client, db: drizzle(client, { schema }) };
}

export function getDb(): Db {
  if (!globalForDb.__db) {
    const { client, db } = createDb(databaseUrl(), databaseToken());
    globalForDb.__libsql = client;
    globalForDb.__db = db;
  }
  return globalForDb.__db;
}
