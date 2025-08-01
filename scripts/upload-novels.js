import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const NOVEL_FILES = [
  'モルグ街の殺人事件.txt',
  '怪人二十面相.txt',
  '宮本武蔵地の巻.txt',
  '空き家の冒険.txt',
  '最後の一葉.txt',
]

const API_ENDPOINT = 'http://localhost:3000/api/novel/storage' // 正しいエンドポイントパス

async function uploadNovel(filePath, fileName) {
  try {
    // ファイルを読み込む
    const text = await fs.readFile(filePath, 'utf-8')
    console.log(`📖 読み込み完了: ${fileName} (${text.length}文字)`)

    // APIにPOST
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `アップロードに失敗しました: ${response.status}`)
    }

    console.log(`✅ アップロード成功: ${fileName}`)
    console.log(`   UUID: ${data.uuid}`)
    console.log(`   保存先: ${data.fileName}`)
    console.log('')

    return data
  } catch (error) {
    console.error(`❌ エラー: ${fileName} - ${error.message}`)
    return null
  }
}

async function main() {
  console.log('🚀 小説ファイルのアップロードを開始します...\n')

  const results = []

  for (const fileName of NOVEL_FILES) {
    const filePath = path.join(__dirname, '..', 'docs', fileName)
    const result = await uploadNovel(filePath, fileName)
    if (result) {
      results.push({
        originalName: fileName,
        ...result,
      })
    }

    // レート制限回避のため少し待機
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  // 結果をJSONファイルに保存
  const resultsPath = path.join(__dirname, '..', 'docs', 'uploaded-novels.json')
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf-8')

  console.log('\n📄 アップロード結果を保存しました:', resultsPath)
  console.log(`✨ 完了: ${results.length}/${NOVEL_FILES.length} ファイル`)
}

// 実行
main().catch(console.error)
