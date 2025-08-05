#!/usr/bin/env ts-node

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { OpenAPIGenerator, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

async function main() {
  // TODO: 各ルートモジュールが export する Registry を集約する仕組みを整備する
  const registry = new OpenAPIRegistry()

  // 仮のヘルスチェックエンドポイント
  registry.registerPath({
    method: 'get',
    path: '/health',
    responses: {
      200: z.void(),
    },
  })

  const generator = new OpenAPIGenerator(registry.definitions)
  const document = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Novel2Manga API',
      version: '1.0.0',
    },
  })

  const outPath = path.join(process.cwd(), 'openapi.json')
  await fs.writeFile(outPath, JSON.stringify(document, null, 2), 'utf-8')
  console.log(`OpenAPI spec generated at ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
