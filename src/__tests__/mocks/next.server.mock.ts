// Minimal runtime shims for Next's server API used in unit tests.
export class NextResponse {
  status: number
  body: any

  constructor(body?: any, init?: { status?: number }) {
    this.body = body
    this.status = init?.status ?? 200
  }

  static json(body: any, init?: { status?: number }) {
    return new NextResponse(body, init)
  }

  async json() {
    return this.body
  }

  static redirect(url: string, status = 307) {
    return new NextResponse(null, { status })
  }
}

export class NextRequest {
  url: string
  method: string
  private _body: any
  headers: Map<string, string>
  nextUrl: URL

  constructor(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: any },
  ) {
    this.url = url
    this.method = init?.method ?? 'GET'
    this._body = init?.body
    this.headers = new Map(Object.entries(init?.headers ?? {}))
    this.nextUrl = new URL(url)
  }

  async json() {
    if (this._body === undefined || this._body === null) return null
    if (typeof this._body === 'string') {
      try {
        return JSON.parse(this._body)
      } catch {
        return this._body
      }
    }
    return this._body
  }

  get headersObj() {
    // convenience for tests that inspect headers as an object
    const obj: Record<string, string> = {}
    for (const [k, v] of this.headers.entries()) obj[k] = v
    return obj
  }
}

export const experimental = {}
