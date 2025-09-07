import { z } from 'zod'
import {
  type VerticalTextBatchRequest,
  VerticalTextBatchRequestSchema,
  type VerticalTextBatchResponse,
  VerticalTextBatchResponseSchema,
  type VerticalTextRenderRequest,
  VerticalTextRenderRequestSchema,
  type VerticalTextRenderResponse,
  VerticalTextRenderResponseSchema,
} from '@/types/vertical-text'

const EnvSchema = z.object({ url: z.string().url(), token: z.string().min(1) })

// Type-safe helpers for extracting error details without using `any`
type NetErrorCause = {
  code?: string
  address?: string
  port?: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function extractNetErrorInfo(e: unknown): {
  code?: string
  address?: string
  port?: number
  name?: string
  message?: string
} {
  const info: { code?: string; address?: string; port?: number; name?: string; message?: string } =
    {}
  if (e instanceof Error) {
    info.name = e.name
    info.message = e.message
    const withCause = e as { cause?: unknown } // safe structural cast
    if (isRecord(withCause.cause)) {
      const c = withCause.cause as NetErrorCause
      if (typeof c.code === 'string') info.code = c.code
      if (typeof c.address === 'string') info.address = c.address
      if (typeof c.port === 'number') info.port = c.port
    }
    // Some environments may set code on the top-level error
    const maybeCode = (e as unknown as { code?: unknown }).code
    if (typeof maybeCode === 'string') info.code = info.code || maybeCode
  }
  return info
}

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
  } catch (validationError) {
    // Log validation error for debugging context
    console.debug('Vertical text API validation failed:', validationError)
    const _missingKeys = {
      url: triedUrlKeys.filter((k) => !process.env[k]).join(' | '),
      token: [...triedTokenKeys, 'API_TOKEN (fallback)'].filter((k) => !process.env[k]).join(' | '),
    }
    throw new Error(
      `Vertical text API env not configured. Set URL and TOKEN. Tried URL keys: ${triedUrlKeys.join(', ')}; Token keys: ${triedTokenKeys.join(', ')}, and API_TOKEN (fallback).`,
    )
  }
}

function toSnakeCasePayload(req: Partial<VerticalTextRenderRequest>) {
  return {
    text: req.text,
    font: req.font,
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
    const endpoint = `${url.replace(/\/$/, '')}/render`
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toSnakeCasePayload(validated)),
        signal: signal ?? controller.signal,
      })
    } catch (e) {
      const info = extractNetErrorInfo(e)
      const isTimeout = info.code === 'AbortError' || info.name === 'AbortError'
      const addr = info.address ? ` ${info.address}` : ''
      const port = typeof info.port === 'number' ? `:${info.port}` : ''
      const suffix = isTimeout ? ' (timeout)' : ''
      throw new Error(
        `vertical-text API request failed: POST ${endpoint}${addr}${port} → ${info.code || info.name || info.message || 'unknown error'}${suffix}`,
      )
    }
    if (!res.ok) {
      throw new Error(`vertical-text API failed: POST ${endpoint} → HTTP ${res.status}`)
    }
    const json = await res.json()
    const meta = VerticalTextRenderResponseSchema.parse(json)

    // Add stronger validation for the response from the API
    if (typeof meta.image_base64 !== 'string' || meta.image_base64.length < 10) {
      throw new Error(
        `vertical-text API returned invalid image_base64 (length: ${meta.image_base64?.length ?? 'undefined'})`,
      )
    }

    // Decode base64 PNG
    const pngBuffer = Buffer.from(meta.image_base64, 'base64')

    // Validate buffer is a valid PNG
    const isPng =
      pngBuffer.length > 8 &&
      pngBuffer[0] === 0x89 &&
      pngBuffer[1] === 0x50 &&
      pngBuffer[2] === 0x4e &&
      pngBuffer[3] === 0x47 &&
      pngBuffer[4] === 0x0d &&
      pngBuffer[5] === 0x0a &&
      pngBuffer[6] === 0x1a &&
      pngBuffer[7] === 0x0a

    if (!isPng) {
      throw new Error('vertical-text API did not return a valid PNG image')
    }

    return { meta, pngBuffer }
  } finally {
    clearTimeout(timeout)
  }
}

export interface RenderedVerticalTextBatchItem extends RenderedVerticalText {}

export async function renderVerticalTextBatch(
  input: VerticalTextBatchRequest,
  signal?: AbortSignal,
): Promise<RenderedVerticalTextBatchItem[]> {
  const { url, token } = readEnv()
  const validated = VerticalTextBatchRequestSchema.parse(input)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(60000, Number(process.env.VERTICAL_TEXT_API_TIMEOUT_MS) || 30000),
  )
  try {
    const body = {
      // defaults は text を含まないため Partial で変換し、未定義のキーは JSON.stringify で落ちる
      defaults: validated.defaults ? toSnakeCasePayload(validated.defaults) : undefined,
      items: validated.items.map((it) => toSnakeCasePayload(it)),
    }

    const endpoint = `${url.replace(/\/$/, '')}/render/batch`
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: signal ?? controller.signal,
      })
    } catch (e) {
      const info = extractNetErrorInfo(e)
      const isTimeout = info.code === 'AbortError' || info.name === 'AbortError'
      const addr = info.address ? ` ${info.address}` : ''
      const port = typeof info.port === 'number' ? `:${info.port}` : ''
      const suffix = isTimeout ? ' (timeout)' : ''
      throw new Error(
        `vertical-text API request failed: POST ${endpoint}${addr}${port} → ${info.code || info.name || info.message || 'unknown error'}${suffix}`,
      )
    }

    if (!res.ok) {
      throw new Error(`vertical-text API failed: POST ${endpoint} → HTTP ${res.status}`)
    }

    const json = (await res.json()) as unknown
    const parsed: VerticalTextBatchResponse = VerticalTextBatchResponseSchema.parse(json)

    const results: RenderedVerticalTextBatchItem[] = parsed.results.map((meta) => {
      if (typeof meta.image_base64 !== 'string' || meta.image_base64.length < 10) {
        throw new Error(
          `vertical-text API returned invalid image_base64 (length: ${meta.image_base64?.length ?? 'undefined'})`,
        )
      }
      const pngBuffer = Buffer.from(meta.image_base64, 'base64')
      const isPng =
        pngBuffer.length > 8 &&
        pngBuffer[0] === 0x89 &&
        pngBuffer[1] === 0x50 &&
        pngBuffer[2] === 0x4e &&
        pngBuffer[3] === 0x47 &&
        pngBuffer[4] === 0x0d &&
        pngBuffer[5] === 0x0a &&
        pngBuffer[6] === 0x1a &&
        pngBuffer[7] === 0x0a
      if (!isPng) {
        throw new Error('vertical-text API did not return a valid PNG image')
      }
      return { meta, pngBuffer }
    })

    return results
  } finally {
    clearTimeout(timeout)
  }
}
