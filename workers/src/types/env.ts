/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  ENVIRONMENT: string;
}