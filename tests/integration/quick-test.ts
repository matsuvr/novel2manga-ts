// 簡単なテキストで分析フローをテスト
async function quickTest() {
  const shortText = `武蔵は刀を構えた。
  「お主の実力、見せてもらおう」
  敵は笑みを浮かべながら答えた。
  「望むところだ」
  二人の剣士は、月明かりの下で対峙した。`

  console.log('=== クイックテスト開始 ===')

  // Step 1: 小説登録
  console.log('Step 1: 小説登録...')
  const novelResponse = await fetch('http://localhost:3000/api/novel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: shortText }),
  })

  if (!novelResponse.ok) {
    console.error('小説登録失敗:', await novelResponse.text())
    return
  }

  const { uuid: novelId } = await novelResponse.json()
  console.log(`✓ 小説登録完了: ${novelId}`)

  // Step 2: 分析実行
  console.log('Step 2: 分析実行...')
  const analyzeResponse = await fetch('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ novelId }),
  })

  if (!analyzeResponse.ok) {
    console.error('分析失敗:', await analyzeResponse.text())
    return
  }

  const { jobId, chunkCount } = await analyzeResponse.json()
  console.log(`✓ 分析完了: jobId=${jobId}, chunks=${chunkCount}`)

  // Step 3: エピソード分析
  console.log('Step 3: エピソード分析...')
  const episodeResponse = await fetch(`http://localhost:3000/api/jobs/${jobId}/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useOpenRouter: true }),
  })

  if (!episodeResponse.ok) {
    console.error('エピソード分析失敗:', await episodeResponse.text())
    return
  }

  console.log('✓ エピソード分析開始')

  // ステータス確認
  console.log('Step 4: ステータス確認...')
  await new Promise((resolve) => setTimeout(resolve, 5000)) // 5秒待機

  const statusResponse = await fetch(`http://localhost:3000/api/jobs/${jobId}/status`)
  const status = await statusResponse.json()
  console.log('最終ステータス:', status)

  console.log('=== テスト完了 ===')
}

quickTest().catch(console.error)
