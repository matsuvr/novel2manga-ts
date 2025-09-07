以下の設計に従い、縦書きの文字組画像APIをサービス内部に持つ。Effect TSを使う

# 縦書きテキスト生成API - TypeScript/Effect TS 設計指示書 v2

## 1. プロジェクト概要

### 1.1 目的

Pythonで実装された日本語縦書きテキスト画像生成APIを、TypeScript + Effect TSで再実装する。HTMLとCSSの組版美をプログラムで生成される画像に取り入れることが主目的。

### 1.2 主要機能

- 日本語テキストを縦書きでレンダリング
- HTML/CSSベースの高品質な組版
- BudouX（JavaScript版）による自動改行処理
- 複数フォント対応（アンチック、ゴシック、明朝）
- バッチ処理対応
- 透明背景PNG生成
- 自動トリミング機能

### 1.3 技術スタック

- **言語**: TypeScript 5.x
- **フレームワーク**: Effect TS (https://effect.website)
- **HTTPサーバー**: @effect/platform-node/HttpServer
- **HTMLレンダリング**: Playwright (JavaScript版)
- **画像処理**: Sharp
- **日本語処理**: BudouX (JavaScript版)

## 2. Effect TS アーキテクチャ設計

### 2.1 レイヤー構成（Effect推奨パターン）

```typescript
// Layer構成図 - 依存関係の明確化
┌─────────────────────────┐
│     HttpRouter          │ ← @effect/platform HttpRouter
├─────────────────────────┤
│   Application Services  │ ← RenderService (ビジネスロジック)
├─────────────────────────┤
│    Domain Services      │ ← HTMLGenerator, TextProcessor
├─────────────────────────┤
│  Infrastructure Services│ ← PlaywrightService, ImageService
├─────────────────────────┤
│    Configuration        │ ← Config.Config (環境変数)
└─────────────────────────┘
```

### 2.2 Effect TSベストプラクティスの適用

1. **Service Definition**: Context.GenericTagによるサービス定義
2. **Error Handling**: Data.TaggedErrorによる型安全なエラー階層
3. **Concurrency Control**: Semaphore + Effect.forEachによる並行処理制御
4. **Resource Management**: Scope + Effect.acquireReleaseによるリソース管理
5. **Configuration**: Config.Config + ConfigProviderによる設定管理
6. **Validation**: @effect/schema/Schemaによる入出力検証
7. **Observability**: Effect.logによる構造化ログ

## 3. モジュール構成

### 3.1 ディレクトリ構造

```
現在の構造に適合させる
```

## 4. 詳細実装仕様

### 4.1 AppConfig.ts - 設定管理

```typescript
import { Config, ConfigProvider } from 'effect'
import { Schema } from '@effect/schema'

// 設定スキーマの定義
const AppConfigSchema = Schema.Struct({
  port: Schema.Number.pipe(
    Schema.annotations({
      description: 'Server port',
      default: 8000,
    }),
  ),
  apiToken: Schema.String.pipe(
    Schema.annotations({
      description: 'API authentication token',
      secret: true, // Redactedとして扱う
    }),
  ),
  maxConcurrency: Schema.Number.pipe(Schema.between(1, 10), Schema.annotations({ default: 2 })),
  maxBatchItems: Schema.Number.pipe(Schema.between(1, 100), Schema.annotations({ default: 50 })),
  fonts: Schema.Struct({
    defaultPath: Schema.String,
    gothic: Schema.String,
    mincho: Schema.String,
  }),
  playwright: Schema.Struct({
    poolSize: Schema.Number.pipe(Schema.annotations({ default: 2 })),
    headless: Schema.Boolean.pipe(Schema.annotations({ default: true })),
  }),
})

// Config型の導出
export interface AppConfig extends Schema.Schema.Type<typeof AppConfigSchema> {}

// Config読み込み
export const AppConfig = Config.all({
  port: Config.number('PORT').pipe(Config.withDefault(8000)),
  apiToken: Config.string('API_TOKEN').pipe(Config.redacted),
  maxConcurrency: Config.number('MAX_CONCURRENCY').pipe(Config.withDefault(2)),
  maxBatchItems: Config.number('MAX_BATCH_ITEMS').pipe(Config.withDefault(50)),
  fonts: Config.all({
    defaultPath: Config.string('FONT_DEFAULT_PATH').pipe(
      Config.withDefault('./fonts/GenEiAntiqueNv5-M.ttf'),
    ),
    gothic: Config.string('FONT_GOTHIC_PATH').pipe(
      Config.withDefault('./fonts/GenEiMGothic2-Regular.ttf'),
    ),
    mincho: Config.string('FONT_MINCHO_PATH').pipe(
      Config.withDefault('./fonts/GenEiChikugoMin3-R.ttf'),
    ),
  }),
  playwright: Config.all({
    poolSize: Config.number('PAGE_POOL_SIZE').pipe(Config.withDefault(2)),
    headless: Config.boolean('PLAYWRIGHT_HEADLESS').pipe(Config.withDefault(true)),
  }),
})
```

### 4.2 エラー定義 - AppErrors.ts

```typescript
import { Data } from 'effect'

// エラー階層の定義（Data.TaggedError使用）
export class RenderError extends Data.TaggedError('RenderError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class FontError extends Data.TaggedError('FontError')<{
  readonly message: string
  readonly fontPath: string
  readonly cause?: unknown
}> {}

export class PlaywrightError extends Data.TaggedError('PlaywrightError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
  readonly errors: ReadonlyArray<unknown>
}> {}

export class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly message: string
}> {}

// Union型でエラーをまとめる
export type AppError =
  | RenderError
  | FontError
  | PlaywrightError
  | ValidationError
  | AuthenticationError
```

### 4.3 スキーマ定義 - RequestSchema.ts

```typescript
import { Schema } from '@effect/schema'

// リクエストスキーマ
export const VerticalTextRequestSchema = Schema.Struct({
  text: Schema.String.pipe(
    Schema.nonEmpty(),
    Schema.annotations({
      title: 'Text',
      description: 'レンダリングするテキスト',
    }),
  ),
  font: Schema.optional(
    Schema.Literal('gothic', 'mincho').pipe(
      Schema.annotations({
        description: '使用するフォント',
        default: 'antique',
      }),
    ),
  ),
  fontSize: Schema.Number.pipe(Schema.between(8, 100), Schema.annotations({ default: 20 })),
  lineHeight: Schema.Number.pipe(Schema.between(1.0, 3.0), Schema.annotations({ default: 1.6 })),
  letterSpacing: Schema.Number.pipe(Schema.between(0, 0.5), Schema.annotations({ default: 0.05 })),
  padding: Schema.Number.pipe(Schema.between(0, 100), Schema.annotations({ default: 20 })),
  useTategakiJs: Schema.Boolean.pipe(Schema.annotations({ default: false })),
  maxCharsPerLine: Schema.optional(Schema.Number.pipe(Schema.between(1, 100))),
})

export type VerticalTextRequest = Schema.Schema.Type<typeof VerticalTextRequestSchema>

// バッチリクエストスキーマ
export const BatchRenderItemSchema = Schema.extend(
  VerticalTextRequestSchema,
  Schema.Struct({
    id: Schema.optional(Schema.String), // バッチ内での識別用
  }),
)

export const BatchRenderRequestSchema = Schema.Struct({
  defaults: Schema.optional(Schema.omit(VerticalTextRequestSchema, 'text')),
  items: Schema.NonEmptyArray(BatchRenderItemSchema),
})

export type BatchRenderRequest = Schema.Schema.Type<typeof BatchRenderRequestSchema>
```

### 4.4 PlaywrightService.ts - ブラウザ管理

```typescript
import { Effect, Context, Layer, Pool, Scope, Queue, Ref } from 'effect'
import { Browser, Page, chromium } from 'playwright'
import { PlaywrightError } from '../errors/AppErrors'

// Serviceの定義
export class PlaywrightService extends Context.Tag('PlaywrightService')<
  PlaywrightService,
  {
    readonly acquirePage: Effect.Effect<Page, PlaywrightError>
    readonly releasePage: (page: Page) => Effect.Effect<void>
    readonly withPage: <A, E>(
      f: (page: Page) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | PlaywrightError>
  }
>() {}

// ブラウザインスタンスの作成
const makeBrowser = Effect.acquireRelease(
  Effect.tryPromise({
    try: () =>
      chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      }),
    catch: (error) =>
      new PlaywrightError({
        message: 'Failed to launch browser',
        cause: error,
      }),
  }),
  (browser) => Effect.promise(() => browser.close()).pipe(Effect.catchAll(() => Effect.void)),
)

// Pageプールの作成
const makePagePool = (browser: Browser, poolSize: number) =>
  Pool.make({
    acquire: Effect.gen(function* (_) {
      const page = yield* _(
        Effect.tryPromise({
          try: () =>
            browser.newPage({
              viewport: { width: 10, height: 10 },
            }),
          catch: (error) =>
            new PlaywrightError({
              message: 'Failed to create page',
              cause: error,
            }),
        }),
      )

      // デフォルトタイムアウト設定
      yield* _(Effect.promise(() => page.setDefaultNavigationTimeout(30000)))

      return page
    }),
    size: poolSize,
  })

// Serviceの実装
export const PlaywrightServiceLive = Layer.scoped(
  PlaywrightService,
  Effect.gen(function* (_) {
    const config = yield* _(AppConfig)
    const browser = yield* _(makeBrowser)
    const pool = yield* _(makePagePool(browser, config.playwright.poolSize))

    const acquirePage = pool.get

    const releasePage = (page: Page) =>
      Effect.gen(function* (_) {
        // ページをクリーンアップしてプールに戻す
        yield* _(
          Effect.tryPromise({
            try: () => page.goto('about:blank'),
            catch: () =>
              new PlaywrightError({
                message: 'Failed to reset page',
              }),
          }).pipe(Effect.catchAll(() => Effect.void)),
        )
        yield* _(pool.invalidate(page))
      })

    const withPage = <A, E>(f: (page: Page) => Effect.Effect<A, E>) =>
      Effect.scoped(
        Effect.gen(function* (_) {
          const page = yield* _(Effect.acquireRelease(acquirePage, releasePage))
          return yield* _(f(page))
        }),
      )

    return {
      acquirePage,
      releasePage,
      withPage,
    }
  }),
)
```

### 4.5 TextProcessorService.ts - BudouX統合

```typescript
import { Effect, Context, Layer } from 'effect'
import { loadDefaultJapaneseParser } from 'budoux'

export class TextProcessorService extends Context.Tag('TextProcessorService')<
  TextProcessorService,
  {
    readonly processForVertical: (text: string, maxCharsPerLine?: number) => Effect.Effect<string>
    readonly applyBudouxLineBreaks: (text: string, maxCharsPerLine: number) => Effect.Effect<string>
  }
>() {}

export const TextProcessorServiceLive = Layer.succeed(
  TextProcessorService,
  Effect.gen(function* (_) {
    // BudouXパーサーの初期化
    const parser = loadDefaultJapaneseParser()

    const applyBudouxLineBreaks = (text: string, maxCharsPerLine: number) =>
      Effect.sync(() => {
        const lines = text.split('\n')
        const processedLines: string[] = []

        for (const line of lines) {
          if (line.length <= maxCharsPerLine) {
            processedLines.push(line)
          } else {
            // BudouXで文節に分割
            const chunks = parser.parse(line)
            let currentLine = ''
            let currentLength = 0

            for (const chunk of chunks) {
              const chunkLength = chunk.length

              // チャンクが最大文字数を超える場合、強制分割
              if (chunkLength > maxCharsPerLine) {
                if (currentLine) {
                  processedLines.push(currentLine)
                  currentLine = ''
                  currentLength = 0
                }

                // 強制分割
                for (let i = 0; i < chunkLength; i += maxCharsPerLine) {
                  processedLines.push(chunk.slice(i, Math.min(i + maxCharsPerLine, chunkLength)))
                }
                continue
              }

              if (currentLength + chunkLength <= maxCharsPerLine) {
                currentLine += chunk
                currentLength += chunkLength
              } else {
                if (currentLine) {
                  processedLines.push(currentLine)
                }
                currentLine = chunk
                currentLength = chunkLength
              }
            }

            if (currentLine) {
              processedLines.push(currentLine)
            }
          }
        }

        // 禁則処理
        return applyKinsoku(processedLines).join('\n')
      })

    const applyKinsoku = (lines: string[]): string[] => {
      const forbidden = new Set(['、', '。', '」', '〟', 'っ', 'ッ', 'ｯ'])
      const result = [...lines]

      for (let i = 1; i < result.length; i++) {
        while (result[i] && forbidden.has(result[i][0])) {
          result[i - 1] += result[i][0]
          result[i] = result[i].slice(1)
        }
      }

      return result
    }

    const processForVertical = (text: string, maxCharsPerLine?: number) =>
      Effect.gen(function* (_) {
        // 最大文字数の計算
        const effectiveMaxChars =
          maxCharsPerLine ?? Math.max(1, Math.round(Math.sqrt(text.replace(/\n/g, '').length)))

        // BudouXによる改行処理
        const processedText = yield* _(applyBudouxLineBreaks(text, effectiveMaxChars))

        // HTMLエスケープ
        const escaped = processedText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')

        // 縦書き用の処理
        const lines = escaped.split('\n')
        const verticalLines = lines.map((line) => {
          // 2桁数字を縦中横に
          line = line.replace(/(?<!\d)(\d{1,2})(?!\d)/g, '<span class="tcy">$1</span>')

          // 三点リーダーを縦書き用に変換
          line = line.replace(/…/g, '︙')

          // 棒状記号の回転処理
          line = line.replace(/[–—―−－─━⎯⸺⸻]+/g, (match) =>
            match
              .split('')
              .map((ch) => `<span class="rotate-90">${ch}</span>`)
              .join(''),
          )

          return line
        })

        return verticalLines.join('<br>')
      })

    return {
      processForVertical,
      applyBudouxLineBreaks,
    }
  }),
)
```

### 4.6 RenderService.ts - レンダリング統合

```typescript
import { Effect, Context, Layer, Semaphore, Duration, Metric } from 'effect'
import { RenderError } from '../errors/AppErrors'

// メトリクス定義
const renderDuration = Metric.histogram(
  'render_duration_ms',
  Metric.boundaries.linear({ start: 0, width: 100, count: 10 }),
)

export class RenderService extends Context.Tag('RenderService')<
  RenderService,
  {
    readonly render: (
      request: VerticalTextRequest,
    ) => Effect.Effect<VerticalTextResponse, RenderError>
    readonly renderBatch: (
      request: BatchRenderRequest,
    ) => Effect.Effect<BatchRenderResponse, RenderError>
  }
>() {}

export const RenderServiceLive = Layer.effect(
  RenderService,
  Effect.gen(function* (_) {
    const config = yield* _(AppConfig)
    const htmlGenerator = yield* _(HTMLGeneratorService)
    const playwright = yield* _(PlaywrightService)
    const imageService = yield* _(ImageService)

    // 同時実行制御用セマフォ
    const semaphore = yield* _(Semaphore.make(config.maxConcurrency))

    const renderSingle = (request: VerticalTextRequest) =>
      semaphore.withPermits(1)(
        Effect.gen(function* (_) {
          const startTime = Date.now()

          // HTML生成
          const html = yield* _(htmlGenerator.generate(request))

          // Playwrightでレンダリング
          const screenshot = yield* _(
            playwright.withPage((page) =>
              Effect.gen(function* (_) {
                // HTMLをセット
                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      page.setContent(html, {
                        waitUntil: 'domcontentloaded',
                      }),
                    catch: (e) =>
                      new RenderError({
                        message: 'Failed to set content',
                        cause: e,
                      }),
                  }),
                )

                // フォント読み込み待機
                yield* _(
                  Effect.tryPromise({
                    try: () => page.waitForFunction('() => document.fonts.ready'),
                    catch: (e) =>
                      new RenderError({
                        message: 'Font loading failed',
                        cause: e,
                      }),
                  }),
                )

                // 背景を透明に
                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      page.evaluate(`
                    () => {
                      document.body.style.backgroundColor = 'transparent';
                      document.documentElement.style.backgroundColor = 'transparent';
                    }
                  `),
                    catch: (e) =>
                      new RenderError({
                        message: 'Failed to set transparent background',
                        cause: e,
                      }),
                  }),
                )

                // サイズ取得
                const dimensions = yield* _(
                  Effect.tryPromise({
                    try: () =>
                      page.evaluate(`
                    () => {
                      const container = document.querySelector('.vertical-text-container');
                      return {
                        width: Math.ceil(container.scrollWidth),
                        height: Math.ceil(container.scrollHeight)
                      };
                    }
                  `),
                    catch: (e) =>
                      new RenderError({
                        message: 'Failed to get dimensions',
                        cause: e,
                      }),
                  }),
                ) as { width: number; height: number }

                // スクリーンショット撮影
                const screenshot = yield* _(
                  Effect.tryPromise({
                    try: () =>
                      page.locator('.vertical-text-container').screenshot({
                        type: 'png',
                        omitBackground: true,
                      }),
                    catch: (e) =>
                      new RenderError({
                        message: 'Screenshot failed',
                        cause: e,
                      }),
                  }),
                )

                return { screenshot, dimensions }
              }),
            ),
          )

          // 画像処理（トリミング）
          const trimmed = yield* _(imageService.trimImage(screenshot.screenshot))

          // Base64エンコード
          const base64 = yield* _(imageService.toBase64(trimmed.buffer))

          const processingTime = Date.now() - startTime

          return {
            imageBase64: base64,
            width: trimmed.width,
            height: trimmed.height,
            processingTimeMs: processingTime,
            trimmed: trimmed.trimmed,
            font: request.font ?? 'antique',
          }
        }).pipe(
          // メトリクス記録
          Metric.trackDuration(renderDuration),
          // タイムアウト設定
          Effect.timeout(Duration.seconds(30)),
          // エラー時のリトライ
          Effect.retry({
            times: 2,
            delay: Duration.millis(100),
          }),
        ),
      )

    const renderBatch = (request: BatchRenderRequest) =>
      Effect.gen(function* (_) {
        // デフォルト値のマージ
        const items = request.items.map((item) => ({
          ...request.defaults,
          ...item,
        }))

        // 並行処理でレンダリング
        const results = yield* _(
          Effect.forEach(
            items,
            (item) =>
              renderSingle(item).pipe(
                Effect.map((result) => ({
                  id: item.id,
                  ...result,
                  error: null,
                })),
                Effect.catchAll((error) =>
                  Effect.succeed({
                    id: item.id,
                    error: {
                      code: 'RENDER_ERROR',
                      message: error.message,
                    },
                  }),
                ),
              ),
            {
              concurrency: config.maxConcurrency,
              batching: true,
            },
          ),
        )

        return { results }
      })

    return {
      render: renderSingle,
      renderBatch,
    }
  }),
)
```

### 4.7 HTTPルート定義 - routes.ts

```typescript
import { HttpRouter, HttpServerRequest, HttpServerResponse, HttpMiddleware } from '@effect/platform'
import { Effect, Schema } from 'effect'
import { AuthenticationError, ValidationError } from '../errors/AppErrors'

// 認証ミドルウェア
const authMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const config = yield* _(AppConfig)

    const authHeader = request.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return yield* _(Effect.fail(new AuthenticationError({ message: 'Missing or invalid token' })))
    }

    const token = authHeader.slice(7)

    if (token !== config.apiToken.value) {
      return yield* _(Effect.fail(new AuthenticationError({ message: 'Invalid token' })))
    }

    return yield* _(app)
  }),
)

// /render エンドポイント
const renderRoute = HttpRouter.post(
  '/render',
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const renderService = yield* _(RenderService)

    // ボディのパースとバリデーション
    const body = yield* _(
      request.json.pipe(
        Effect.flatMap(Schema.decodeUnknown(VerticalTextRequestSchema)),
        Effect.mapError(
          (errors) =>
            new ValidationError({
              message: 'Invalid request body',
              errors: Array.isArray(errors) ? errors : [errors],
            }),
        ),
      ),
    )

    // レンダリング実行
    const result = yield* _(renderService.render(body))

    return HttpServerResponse.json(result)
  }).pipe(authMiddleware),
)

// /render/batch エンドポイント
const batchRenderRoute = HttpRouter.post(
  '/render/batch',
  Effect.gen(function* (_) {
    const request = yield* _(HttpServerRequest.HttpServerRequest)
    const renderService = yield* _(RenderService)
    const config = yield* _(AppConfig)

    // ボディのパースとバリデーション
    const body = yield* _(
      request.json.pipe(
        Effect.flatMap(Schema.decodeUnknown(BatchRenderRequestSchema)),
        Effect.mapError(
          (errors) =>
            new ValidationError({
              message: 'Invalid request body',
              errors: Array.isArray(errors) ? errors : [errors],
            }),
        ),
      ),
    )

    // アイテム数チェック
    if (body.items.length > config.maxBatchItems) {
      return yield* _(
        Effect.fail(
          new ValidationError({
            message: `Too many items. Maximum is ${config.maxBatchItems}`,
            errors: [],
          }),
        ),
      )
    }

    // バッチレンダリング実行
    const result = yield* _(renderService.renderBatch(body))

    return HttpServerResponse.json(result)
  }).pipe(authMiddleware),
)

// ヘルスチェック
const healthRoute = HttpRouter.get(
  '/health',
  Effect.succeed(
    HttpServerResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    }),
  ),
)

// ルート情報
const rootRoute = HttpRouter.get(
  '/',
  Effect.succeed(
    HttpServerResponse.json({
      title: 'HTMLベース日本語縦書きAPI',
      version: '1.0.0',
      features: {
        html_css: 'writing-mode: vertical-rl',
        font: '源暎アンチックフォント対応',
        auto_sizing: 'テキスト量に応じた自動サイズ調整',
        auto_trim: '文字列をピッタリ囲むトリミング',
        tategaki_js: 'Tategaki.jsライブラリ対応',
        transparent_bg: '透明背景対応',
        converter: 'Playwright (Chromium)',
        budoux: 'BudouX (JavaScript版) による自然な改行',
      },
      endpoints: {
        '/render': '縦書きテキストをレンダリング（要認証）',
        '/render/batch': '複数テキストを一括レンダリング（要認証）',
        '/health': 'ヘルスチェック',
      },
    }),
  ),
)

// エラーハンドリング
const errorHandler = HttpMiddleware.make((app) =>
  app.pipe(
    Effect.catchTag('AuthenticationError', (error) =>
      Effect.succeed(
        HttpServerResponse.json(
          { error: 'Unauthorized', message: error.message },
          { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
        ),
      ),
    ),
    Effect.catchTag('ValidationError', (error) =>
      Effect.succeed(
        HttpServerResponse.json(
          { error: 'Validation Error', message: error.message, details: error.errors },
          { status: 422 },
        ),
      ),
    ),
    Effect.catchTag('RenderError', (error) =>
      Effect.succeed(
        HttpServerResponse.json({ error: 'Render Error', message: error.message }, { status: 500 }),
      ),
    ),
    Effect.catchAll((error) =>
      Effect.succeed(
        HttpServerResponse.json(
          { error: 'Internal Server Error', message: String(error) },
          { status: 500 },
        ),
      ),
    ),
  ),
)

// ルーター構築
export const router = HttpRouter.empty
  .pipe(
    HttpRouter.mount('/render', renderRoute),
    HttpRouter.mount('/render/batch', batchRenderRoute),
    HttpRouter.mount('/health', healthRoute),
    HttpRouter.mount('/', rootRoute),
  )
  .pipe(errorHandler)
```

### 4.8 main.ts - アプリケーションエントリーポイント

```typescript
import { NodeRuntime, NodeHttpServer } from '@effect/platform-node'
import { Layer, Effect, Console, Logger, LogLevel } from 'effect'
import { router } from './http/routes'

// すべてのLayerを組み合わせる
const MainLayer = Layer.mergeAll(
  PlaywrightServiceLive,
  TextProcessorServiceLive,
  HTMLGeneratorServiceLive,
  FontManagerServiceLive,
  ImageServiceLive,
  RenderServiceLive,
)

// ロガー設定
const LoggerLive = Logger.pretty.pipe(Logger.withMinimumLogLevel(LogLevel.Info))

// HTTPサーバー
const HttpServerLive = NodeHttpServer.server.layer({ port: 8000 }, router)

// メインプログラム
const program = Effect.gen(function* (_) {
  yield* _(Console.log('🚀 Starting vertical text generator API...'))

  const config = yield* _(AppConfig)
  yield* _(Console.log(`✅ Server running on port ${config.port}`))

  // サーバーを無限に実行
  yield* _(Effect.never)
}).pipe(Effect.provide(MainLayer), Effect.provide(HttpServerLive), Effect.provide(LoggerLive))

// アプリケーション実行
NodeRuntime.runMain(program)
```

## 5. package.json

```json
{
  "name": "vertical-text-generator",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "tsx watch src/main.ts",
    "test": "vitest",
    "lint": "eslint src",
    "format": "prettier --write src"
  },
  "dependencies": {
    "effect": "^3.10.0",
    "@effect/platform": "^0.73.0",
    "@effect/platform-node": "^0.69.0",
    "@effect/schema": "^0.78.0",
    "playwright": "^1.48.0",
    "sharp": "^0.33.0",
    "budoux": "^0.6.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.6.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0",
    "@effect/vitest": "^0.13.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

## 6. 実装上の重要ポイント

### 6.1 Effect TSのベストプラクティス

1. **Generator構文の活用**

   ```typescript
   Effect.gen(function* (_) {
     const x = yield* _(effect1)
     const y = yield* _(effect2)
     return x + y
   })
   ```

2. **Pipeによるエフェクトの合成**

   ```typescript
   effect.pipe(
     Effect.tap(logValue),
     Effect.map(transform),
     Effect.catchTag('SpecificError', handleError),
   )
   ```

3. **Layerによる依存性注入**
   - すべてのサービスはLayerとして定義
   - Layer.mergeAllで組み合わせ
   - Effect.provideで注入

4. **Schemaによるバリデーション**
   - 入力値は必ずSchemaで検証
   - Schema.decodeUnknownでランタイム検証
   - エラーは型安全に処理

5. **並行処理の制御**
   - Semaphoreで同時実行数制限
   - Effect.forEachで並行処理
   - Pool.makeでリソース管理

### 6.2 パフォーマンス最適化

1. **Playwrightページプール**
   - 事前作成されたページをプール管理
   - リソースの再利用で起動時間短縮

2. **フォントキャッシュ**
   - Base64エンコード済みフォントをメモリ保持
   - 初回読み込み後は高速アクセス

3. **バッチ処理の並行実行**
   - Effect.forEachのconcurrencyオプション活用
   - batchingオプションでより効率的な処理

4. **メトリクス監視**
   - Metric.histogramで処理時間計測
   - ボトルネックの可視化

### 6.3 エラーハンドリング戦略

1. **階層的エラー定義**
   - Data.TaggedErrorで型安全なエラー
   - catchTagで特定エラーのみ処理

2. **リトライ戦略**

   ```typescript
   Effect.retry({
     times: 3,
     delay: Duration.exponential(100),
   })
   ```

3. **タイムアウト設定**
   ```typescript
   Effect.timeout(Duration.seconds(30))
   ```

## 7. テスト戦略

```typescript
// テスト例
import { Effect, TestClock, TestContext } from '@effect/vitest'
import { describe, it, expect } from 'vitest'

describe('RenderService', () => {
  it('renders vertical text', () =>
    Effect.gen(function* (_) {
      const result = yield* _(
        renderService.render({
          text: 'テスト',
          fontSize: 20,
        }),
      )

      expect(result.imageBase64).toBeDefined()
      expect(result.width).toBeGreaterThan(0)
    }).pipe(Effect.provide(TestLayer), Effect.runPromise))
})
```

## 8. まとめ

この設計は以下の点でEffect TSのベストプラクティスに従っています：

- **完全な型安全性**: Schema + Data.TaggedError
- **関数型プログラミング**: 純粋関数とEffect合成
- **リソース管理**: Scope + Pool
- **並行処理制御**: Semaphore + Effect.forEach
- **観測可能性**: Metric + Logger
- **テスタビリティ**: Layer による依存性注入

BudouXとPlaywrightの既存実装を活用することで、開発効率と品質を両立させています。
