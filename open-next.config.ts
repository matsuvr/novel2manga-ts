import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import type { IncrementalCache, TagCache } from '@opennextjs/aws/types/overrides.js'

export default defineCloudflareConfig({
export default defineCloudflareConfig({
  cache: {
    kv: {
      incrementalCache: 'NEXT_INC_CACHE_KV',
      tagCache: 'NEXT_TAG_CACHE_D1',
    },
  },
  enableCacheInterception: true,
})
})
