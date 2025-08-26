export function getBaseURL(): string {
  const url = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000'
  return url.endsWith('/') ? url.slice(0, -1) : url
}
