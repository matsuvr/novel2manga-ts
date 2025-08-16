import { z } from 'zod'
import {
  type VerticalTextRenderRequest,
  VerticalTextRenderRequestSchema,
  type VerticalTextRenderResponse,
  VerticalTextRenderResponseSchema,
} from '@/types/vertical-text'

const EnvSchema = z.object({ url: z.string().url(), token: z.string().min(1) })

function readEnv() {
  const triedUrlKeys = [
    'VERTICAL_TEXT_API_URL',
    'VERTICAL_TEXT_GENERATOR_URL',
    'TATEGAKI_API_URL',
    'VERTICAL_TEXT_ENDPOINT',
    'VTEXT_API_URL',
  ] as const
  const triedTokenKeys = [
    'VERTICAL_TEXT_API_TOKEN',
    'VERTICAL_TEXT_GENERATOR_TOKEN',
    'TATEGAKI_API_TOKEN',
    'VERTICAL_TEXT_API_KEY',
    'VERTICAL_TEXT_BEARER',
    'VTEXT_API_TOKEN',
  ] as const

  const url = triedUrlKeys.map((k) => process.env[k]).find((v) => v && v.length > 0)
  let token = triedTokenKeys.map((k) => process.env[k]).find((v) => v && v.length > 0)

  // As a last resort, allow generic API_TOKEN only if a vertical-text URL is present
  if (!token && url && process.env.API_TOKEN) token = process.env.API_TOKEN

  try {
    return EnvSchema.parse({ url, token })
  } catch (_e) {
    const _missing = {
      url: triedUrlKeys.filter((k) => !process.env[k]).join(' | '),
      token: [...triedTokenKeys, 'API_TOKEN (fallback)'].filter((k) => !process.env[k]).join(' | '),
    }
    throw new Error(
      `Vertical text API env not configured. Set URL and TOKEN. Tried URL keys: ${triedUrlKeys.join(', ')}; Token keys: ${triedTokenKeys.join(', ')}, and API_TOKEN (fallback).`,
    )
  }
}

function toSnakeCasePayload(req: VerticalTextRenderRequest) {
  return {
    text: req.text,
    font_size: req.fontSize,
    line_height: req.lineHeight,
    letter_spacing: req.letterSpacing,
    padding: req.padding,
    max_chars_per_line: req.maxCharsPerLine,
  }
}

export interface RenderedVerticalText {
  /** Raw API response (validated) */
  meta: VerticalTextRenderResponse
  /** Decoded PNG buffer */
  pngBuffer: Buffer
}

export async function renderVerticalText(
  req: VerticalTextRenderRequest,
  signal?: AbortSignal,
): Promise<RenderedVerticalText> {
  const { url, token } = readEnv()
  const validated = VerticalTextRenderRequestSchema.parse(req)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(60000, Number(process.env.VERTICAL_TEXT_API_TIMEOUT_MS) || 30000),
  )
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toSnakeCasePayload(validated)),
      signal: signal ?? controller.signal,
    })
    if (!res.ok) {
      throw new Error(`vertical-text API failed: ${res.status}`)
    }
    const json = await res.json()
    const meta = VerticalTextRenderResponseSchema.parse(json)
    // Decode base64 PNG
    const pngBuffer = Buffer.from(meta.image_base64, 'base64')
    if (pngBuffer.length === 0) throw new Error('vertical-text API returned empty image')
    return { meta, pngBuffer }
  } finally {
    clearTimeout(timeout)
  }
}
