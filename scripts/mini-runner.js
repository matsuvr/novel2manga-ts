import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'

function run() {
  const width = 800
  const height = 600
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // 背景
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // パネル枠
  const px = 80
  const py = 60
  const pw = 640
  const ph = 480
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.strokeRect(px, py, pw, ph)

  // ダイアログ風テキスト（縦書きを使わず簡易表示）
  ctx.fillStyle = '#000000'
  ctx.font = '20px "Noto Sans JP", sans-serif'
  const text = 'これはテストのテキストです。パネル内に収まるべきです。'

  // 簡易ラップ
  const maxWidth = pw - 40
  const words = text.split('')
  let line = ''
  const lines = []
  for (const ch of words) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line)
      line = ch
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  let ty = py + 30
  for (const l of lines) {
    ctx.fillText(l, px + 20, ty)
    ty += 26
  }

  const out = canvas.toBuffer('image/png')
  const outPath = path.join(os.tmpdir(), 'test-panel-mini.png')
  fs.writeFileSync(outPath, out)
  console.log(`Wrote ${outPath}`)
}

run()
