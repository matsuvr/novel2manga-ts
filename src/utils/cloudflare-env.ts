import type { D1Database } from "@cloudflare/workers-types";

export function getD1Database(): D1Database {
  const db = (globalThis as Record<string, unknown>).DB as
    | D1Database
    | undefined;
  if (!db) {
    throw new Error(
      "D1 Database not available. Make sure you are running in Cloudflare Workers environment."
    );
  }
  return db;
}
