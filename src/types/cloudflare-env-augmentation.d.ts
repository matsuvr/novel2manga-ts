// CloudflareEnv augmentation to include custom vars not generated automatically.
// Keep in sync with wrangler.toml [vars].
// NOTE: Do NOT add secret values here; only type declarations.
// Declare global augmentation
declare global {
  interface CloudflareEnv {
    AUTH_SECRET: string
  }
}

export {}
