import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import { promises as fs } from 'fs'

const DB_PATH = path.join(process.cwd(), '.local-storage', 'novel2manga.db')
const NOVEL_UUID = '0f6cbf28-18c5-40de-895a-2f17d5e26f08'

async function checkAnalysisResults() {
  console.log('=== 分析結果の確認 ===')
  console.log(`Novel UUID: ${NOVEL_UUID}`)
  console.log('')
  
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  })
  
  try {
    // 1. 小説の存在確認
    console.log('1. 小説の存在確認:')
    const novel = await db.get(
      'SELECT * FROM novels WHERE id = ?',
      [NOVEL_UUID]
    )
    
    if (novel) {
      console.log('✓ 小説が見つかりました:')
      console.log(`  - ID: ${novel.id}`)
      console.log(`  - ファイル: ${novel.original_text_file}`)
      console.log(`  - 文字数: ${novel.total_length}`)
      console.log(`  - 作成日時: ${novel.created_at}`)
    } else {
      console.log('✗ 小説が見つかりません')
      return
    }
    
    // 2. チャンクの確認
    console.log('\n2. チャンクの確認:')
    const chunks = await db.all(
      'SELECT * FROM chunks WHERE novel_id = ? ORDER BY chunk_index',
      [NOVEL_UUID]
    )
    
    console.log(`✓ ${chunks.length}個のチャンクが見つかりました`)
    
    if (chunks.length > 0) {
      console.log('  最初の3チャンク:')
      chunks.slice(0, 3).forEach(chunk => {
        console.log(`  - チャンク${chunk.chunk_index}: ID=${chunk.id}, 位置=${chunk.start_position}-${chunk.end_position}`)
      })
    }
    
    // 3. チャンク分析の確認
    console.log('\n3. チャンク分析の確認:')
    const analyses = await db.all(
      `SELECT ca.*, c.chunk_index 
       FROM chunk_analyses ca
       JOIN chunks c ON ca.chunk_id = c.id
       WHERE c.novel_id = ?
       ORDER BY c.chunk_index`,
      [NOVEL_UUID]
    )
    
    console.log(`✓ ${analyses.length}個の分析結果が見つかりました`)
    
    if (analyses.length > 0) {
      console.log('  分析結果の詳細:')
      analyses.forEach(analysis => {
        console.log(`  - チャンク${analysis.chunk_index}:`)
        console.log(`    - 分析ID: ${analysis.id}`)
        console.log(`    - ファイル: ${analysis.analysis_file}`)
        console.log(`    - キャラクター数: ${analysis.character_count}`)
        console.log(`    - シーン数: ${analysis.scene_count}`)
        console.log(`    - 対話数: ${analysis.dialogue_count}`)
        console.log(`    - ハイライト数: ${analysis.highlight_count}`)
        console.log(`    - 状況数: ${analysis.situation_count}`)
        console.log(`    - 処理日時: ${analysis.processed_at}`)
      })
    }
    
    // 4. 分析ファイルの存在確認
    console.log('\n4. 分析ファイルの存在確認:')
    const analysisDir = path.join(process.cwd(), '.local-storage', 'analysis', NOVEL_UUID)
    
    try {
      const files = await fs.readdir(analysisDir)
      console.log(`✓ ${files.length}個の分析ファイルが見つかりました:`)
      files.forEach(file => {
        console.log(`  - ${file}`)
      })
    } catch (error) {
      console.log('✗ 分析ディレクトリが見つかりません')
    }
    
    // 5. ジョブの確認
    console.log('\n5. ジョブの確認:')
    const jobs = await db.all(
      'SELECT * FROM jobs WHERE novel_id = ? ORDER BY created_at DESC',
      [NOVEL_UUID]
    )
    
    console.log(`✓ ${jobs.length}個のジョブが見つかりました:`)
    jobs.forEach(job => {
      console.log(`  - ${job.type}: ${job.status} (進捗: ${job.progress}%)`)
    })
    
  } finally {
    await db.close()
  }
  
  console.log('\n=== 確認完了 ===')
}

checkAnalysisResults().catch(console.error)