import { describe, expect, it } from 'vitest'
import { convertEpisodeTextToScriptWithFragments } from '@/agents/script/fragment-script-converter'

describe('fragment-script-converter (deprecated)', () => {
  it('常に廃止エラーを投げる', async () => {
    await expect(convertEpisodeTextToScriptWithFragments({ episodeText: '' })).rejects.toThrow(
      'Fragment-based script conversion is deprecated and disabled',
    )

    await expect(
      convertEpisodeTextToScriptWithFragments({ episodeText: '任意のテキスト' }, {
        isDemo: true,
        episodeNumber: 1,
      } as unknown as Record<string, unknown>),
    ).rejects.toThrow('Fragment-based script conversion is deprecated and disabled')
  })
})
