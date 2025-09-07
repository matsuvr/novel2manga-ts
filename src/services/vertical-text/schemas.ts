import { Schema } from '@effect/schema'

export const VerticalTextRequestSchema = Schema.Struct({
  text: Schema.String.pipe(Schema.nonEmpty()),
  font: Schema.optional(
    Schema.Literal('gothic', 'mincho').pipe(Schema.annotations({ default: 'antique' })),
  ),
  fontSize: Schema.Number.pipe(Schema.between(8, 100), Schema.annotations({ default: 20 })),
  lineHeight: Schema.Number.pipe(Schema.between(1, 3), Schema.annotations({ default: 1.6 })),
  letterSpacing: Schema.Number.pipe(Schema.between(0, 0.5), Schema.annotations({ default: 0.05 })),
  padding: Schema.Number.pipe(Schema.between(0, 100), Schema.annotations({ default: 20 })),
  useTategakiJs: Schema.Boolean.pipe(Schema.annotations({ default: false })),
  maxCharsPerLine: Schema.optional(Schema.Number.pipe(Schema.between(1, 100))),
})

export interface VerticalTextRequest extends Schema.Schema.Type<typeof VerticalTextRequestSchema> {}

export const BatchRenderItemSchema = Schema.extend(
  VerticalTextRequestSchema,
  Schema.Struct({
    id: Schema.optional(Schema.String),
  }),
)

export const BatchRenderRequestSchema = Schema.Struct({
  defaults: Schema.optional(Schema.omit(VerticalTextRequestSchema, 'text')),
  items: Schema.NonEmptyArray(BatchRenderItemSchema),
})

export type BatchRenderRequest = Schema.Schema.Type<typeof BatchRenderRequestSchema>
