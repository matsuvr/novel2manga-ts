// Central shared consent-related types.
// Keeping literal union centralized avoids divergence between frontend and backend.
// NOTE: If additional consent actions are introduced (e.g., 'NSFW', 'LICENSE'), extend here
// and ensure backend validation & API responses align.

export const CONSENT_ACTIONS = [
  'EXPAND',
  'EXPLAINER',
] as const

export type ConsentAction = (typeof CONSENT_ACTIONS)[number]

// Runtime guard (useful if parsing dynamic JSON in the future)
export function isConsentAction(value: unknown): value is ConsentAction {
  return typeof value === 'string' && (CONSENT_ACTIONS as readonly string[]).includes(value)
}
