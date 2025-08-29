import type { Script } from '@/types/script'

// フラグメント方式は廃止。互換のために関数は残すが、呼び出しは禁止。
export interface FragmentConversionInput {
  episodeText: string
}
export interface FragmentConversionOptions {
  jobId?: string
  episodeNumber?: number
}

export async function convertEpisodeTextToScriptWithFragments(
  _input: FragmentConversionInput,
  _options: FragmentConversionOptions = {},
): Promise<Script> {
  throw new Error('Fragment-based script conversion is deprecated and disabled')
}
