import { Effect } from 'effect'
import { expect, test } from 'vitest'
import {
  TextProcessorService,
  TextProcessorServiceLive,
} from '@/services/vertical-text/text-processor-service'

test('processes text for vertical writing', async () => {
  const program = Effect.gen(function* (_) {
    const svc = yield* _(TextProcessorService)
    const result = yield* _(svc.processForVertical('縦書きテスト', 5))
    return result
  }).pipe(Effect.provide(TextProcessorServiceLive))

  const html = await Effect.runPromise(program)
  expect(html).toContain('縦')
  expect(html).toContain('<br>')
})
