/**
 * 設定統合テスト
 * app.config.tsとconfig-loaderの統合を確認
 */

import { getAppConfig, getChunkingConfig, getCurrentLLMProvider, getLLMConfig } from './src/config'

async function testConfiguration() {
  console.log('🔧 設定統合テスト開始...')

  try {
    // アプリケーション設定の取得
    const appConfig = getAppConfig()
    console.log('✅ アプリケーション設定取得成功')
    console.log('📄 LLMプロバイダー:', appConfig.llm.defaultProvider)

    // チャンク設定の取得
    const chunkingConfig = getChunkingConfig()
    console.log('✅ チャンク設定取得成功')
    console.log('📄 デフォルトチャンクサイズ:', chunkingConfig.defaultChunkSize)
    console.log('📄 デフォルトオーバーラップサイズ:', chunkingConfig.defaultOverlapSize)

    // LLM設定の取得
    const llmConfig = getLLMConfig()
    console.log('✅ LLM設定取得成功')
    console.log('📄 利用可能プロバイダー:', Object.keys(llmConfig.providers))

    // 現在のプロバイダー設定の取得
    const currentProvider = getCurrentLLMProvider()
    console.log('✅ 現在のプロバイダー設定取得成功')
    console.log('📄 現在のプロバイダー:', currentProvider.provider)
    console.log('📄 現在のモデル:', currentProvider.config.model)

    // プロンプト設定の取得
    const textAnalysisConfig = appConfig.llm.textAnalysis
    console.log('✅ テキスト分析設定取得成功')
    console.log('📄 システムプロンプト長:', textAnalysisConfig.systemPrompt.length, '文字')

    const narrativeConfig = appConfig.llm.narrativeArcAnalysis
    console.log('✅ 物語弧分析設定取得成功')
    console.log(
      '📄 ユーザープロンプトテンプレート長:',
      narrativeConfig.userPromptTemplate.length,
      '文字',
    )

    const layoutConfig = appConfig.llm.layoutGeneration
    console.log('✅ レイアウト生成設定取得成功')
    console.log('📄 システムプロンプト長:', layoutConfig.systemPrompt.length, '文字')

    // エピソード設定の取得
    const episodeConfig = appConfig.processing.episode
    console.log('✅ エピソード設定取得成功')
    console.log('📄 目標文字数/エピソード:', episodeConfig.targetCharsPerEpisode)
    console.log('📄 文字数/ページ:', episodeConfig.charsPerPage)

    console.log('🎉 設定統合テスト完了 - すべて正常!')
  } catch (error) {
    console.error('❌ 設定統合テストでエラーが発生:', error)
    process.exit(1)
  }
}

// 環境変数オーバーライドのテスト
async function testEnvironmentOverrides() {
  console.log('\n🔧 環境変数オーバーライドテスト開始...')

  // 環境変数を設定
  process.env.APP_LLM_DEFAULT_PROVIDER = 'claude'
  process.env.APP_CHUNKS_DEFAULT_SIZE = '7000'
  process.env.APP_CHUNKS_DEFAULT_OVERLAP = '700'

  try {
    const appConfig = getAppConfig()

    console.log('📄 オーバーライド後のプロバイダー:', appConfig.llm.defaultProvider)
    console.log('📄 オーバーライド後のチャンクサイズ:', appConfig.chunking.defaultChunkSize)
    console.log('📄 オーバーライド後のオーバーラップサイズ:', appConfig.chunking.defaultOverlapSize)

    // 期待値と比較
    if (appConfig.llm.defaultProvider === 'claude') {
      console.log('✅ プロバイダーオーバーライド成功')
    } else {
      console.log('❌ プロバイダーオーバーライド失敗')
    }

    if (appConfig.chunking.defaultChunkSize === 7000) {
      console.log('✅ チャンクサイズオーバーライド成功')
    } else {
      console.log('❌ チャンクサイズオーバーライド失敗')
    }

    if (appConfig.chunking.defaultOverlapSize === 700) {
      console.log('✅ オーバーラップサイズオーバーライド成功')
    } else {
      console.log('❌ オーバーラップサイズオーバーライド失敗')
    }

    console.log('🎉 環境変数オーバーライドテスト完了')
  } catch (error) {
    console.error('❌ 環境変数オーバーライドテストでエラーが発生:', error)
  }

  // 環境変数をクリア
  delete process.env.APP_LLM_DEFAULT_PROVIDER
  delete process.env.APP_CHUNKS_DEFAULT_SIZE
  delete process.env.APP_CHUNKS_DEFAULT_OVERLAP
}

// テスト実行
;(async () => {
  await testConfiguration()
  await testEnvironmentOverrides()
})()

export { testConfiguration, testEnvironmentOverrides }
