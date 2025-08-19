import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import type { IncrementalCache, TagCache } from '@opennextjs/aws/types/overrides.js'

export default defineCloudflareConfig({
  incrementalCache: 'cf-kv-incremental-cache' as unknown as IncrementalCache,
  tagCache: 'd1-next-mode-tag-cache' as unknown as TagCache,
  enableCacheInterception: true,
})
