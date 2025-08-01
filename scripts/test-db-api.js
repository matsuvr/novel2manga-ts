import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testDatabaseAPI() {
  console.log('📊 データベースAPIのテストを開始...\n')

  try {
    // 1. 小説をアップロード（これによりDBにも保存される）
    console.log('1️⃣ 小説をアップロード...')
    const testText = '吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。'

    const uploadResponse = await fetch('http://localhost:3000/api/novel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: testText }),
    })

    const uploadData = await uploadResponse.json()
    console.log('アップロード結果:', uploadData)
    console.log('UUID:', uploadData.uuid)
    console.log('ジョブ:', uploadData.job)
    console.log('')

    // 2. DB APIから小説情報を取得
    console.log('2️⃣ データベースから小説情報を取得...')
    const getResponse = await fetch(`http://localhost:3000/api/novel/db?id=${uploadData.uuid}`)
    const getData = await getResponse.json()

    console.log('DB取得結果:', JSON.stringify(getData, null, 2))
    console.log('')

    // 3. 全ての小説一覧を取得
    console.log('3️⃣ 全ての小説一覧を取得...')
    const listResponse = await fetch('http://localhost:3000/api/novel/db')
    const listData = await listResponse.json()

    console.log(`登録されている小説数: ${listData.novels?.length || 0}`)
    if (listData.novels?.length > 0) {
      console.log('最新の小説:')
      listData.novels.slice(0, 3).forEach((novel) => {
        console.log(`  - ID: ${novel.id} (${novel.total_length}文字)`)
      })
    }

    // 4. ローカルDBファイルの確認
    console.log('\n4️⃣ ローカルDBファイルの確認...')
    const dbPath = path.join(process.cwd(), '.local-storage', 'novel2manga.db')
    try {
      const stats = await fs.stat(dbPath)
      console.log(`DBファイル: ${dbPath}`)
      console.log(`サイズ: ${stats.size} bytes`)
    } catch (_err) {
      console.log('DBファイルが見つかりません')
    }
  } catch (error) {
    console.error('❌ エラー:', error.message)
  }
}

// 実行
testDatabaseAPI()
