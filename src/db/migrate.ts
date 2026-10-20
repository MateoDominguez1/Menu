import { migrate } from "drizzle-orm/libsql/migrator";
import { databaseToken, databaseUrl } from "@/server/config";
import { createDb } from "./client";

export async function runMigrations(url: string, authToken?: string) {
  const { client, db } = createDb(url, authToken);
  await migrate(db, { migrationsFolder: "./drizzle" });
  client.close();
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = databaseUrl();
  runMigrations(url, databaseToken())
    .then(() => console.log("Migraciones aplicadas en", url))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
