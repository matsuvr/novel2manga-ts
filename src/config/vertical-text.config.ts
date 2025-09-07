import { Config } from 'effect'
import { Schema } from '@effect/schema'

const VerticalTextConfigSchema = Schema.Struct({
  apiToken: Schema.String,
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

export interface VerticalTextConfig extends Schema.Schema.Type<typeof VerticalTextConfigSchema> {}

export const VerticalTextConfig = Config.all({
  apiToken: Config.string('VERTICAL_TEXT_API_TOKEN').pipe(Config.redacted),
  maxConcurrency: Config.number('VERTICAL_TEXT_MAX_CONCURRENCY').pipe(Config.withDefault(2)),
  maxBatchItems: Config.number('VERTICAL_TEXT_MAX_BATCH_ITEMS').pipe(Config.withDefault(50)),
  fonts: Config.all({
    defaultPath: Config.string('VERTICAL_TEXT_FONT_DEFAULT_PATH').pipe(
      Config.withDefault('./fonts/GenEiAntiqueNv5-M.ttf'),
    ),
    gothic: Config.string('VERTICAL_TEXT_FONT_GOTHIC_PATH').pipe(
      Config.withDefault('./fonts/GenEiMGothic2-Regular.ttf'),
    ),
    mincho: Config.string('VERTICAL_TEXT_FONT_MINCHO_PATH').pipe(
      Config.withDefault('./fonts/GenEiChikugoMin3-R.ttf'),
    ),
  }),
  playwright: Config.all({
    poolSize: Config.number('VERTICAL_TEXT_PAGE_POOL_SIZE').pipe(Config.withDefault(2)),
    headless: Config.boolean('VERTICAL_TEXT_PLAYWRIGHT_HEADLESS').pipe(Config.withDefault(true)),
  }),
})

export type { VerticalTextConfigSchema }

export const VerticalTextConfigLive = Config.toLayer(VerticalTextConfig)
