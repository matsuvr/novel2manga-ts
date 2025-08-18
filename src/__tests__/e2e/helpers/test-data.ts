/**
 * E2Eテスト用のテストデータとヘルパー関数
 */

export const TEST_NOVELS = {
  SHORT: `短い物語

これはテスト用の短い物語です。
主人公は困難に立ち向かいます。
最後に成功を収めます。`,

  MEDIUM: `中程度の物語

昔々、ある村に勇敢な少年がいました。
少年の名前は太郎といい、村一番の強さを持っていました。

ある日、村に恐ろしい怪物が現れました。
「誰か助けてくれ！」
村人たちは恐怖に震えていました。

太郎は立ち上がりました。
「僕が怪物を倒してみせる！」
勇敢に剣を抜いて、怪物に向かっていきました。

激しい戦いが始まりました。
太郎は持てる力をすべて使って戦いました。
ついに怪物を倒すことができました。

村人たちは歓喜しました。
「太郎、ありがとう！」
こうして村に平和が戻ったのです。`,

  LONG: `長編物語

第一章　出発

桜舞い散る春の日、新たな冒険者ルークは王都を旅立った。
彼の目的は伝説の剣を見つけることだった。

「必ず見つけてみせる」
ルークは固く決意していた。

第二章　出会い

森を抜けた先で、ルークは一人の魔法使いに出会った。
「君も剣を探しているのか？」
魔法使いの名前はマーリンといった。

「一緒に探そう」
二人は旅の仲間となった。

第三章　試練

山を越え、川を渡り、二人は多くの試練に立ち向かった。
巨大なドラゴンとの戦い。
謎めいた迷宮の攻略。
時には仲間割れもあった。

しかし、二人の絆は強くなっていった。

第四章　発見

ついに、伝説の剣が眠る神殿を見つけた。
「これが伝説の剣か...」
剣は神秘的な光を放っていた。

しかし、剣を取るには最後の試練があった。
真の勇気を証明しなければならないのだ。

第五章　帰還

ルークは見事に試練を乗り越え、剣を手に入れた。
「君こそ真の勇者だ」
マーリンは感動していた。

二人は王都に戻り、英雄として迎えられた。
こうして長い冒険の物語は幕を閉じたのである。`,

  DIALOGUE_HEAVY: `会話中心の物語

「おはよう、太郎！」
「おはよう、花子。今日もいい天気だね」
「本当にそうね。散歩でもしましょうか？」

二人は公園に向かった。

「あのさ、太郎」
「何？」
「私たち、もう長い友達よね」
「そうだね、もう10年以上になるかな」

「実は話があるの」
花子の表情が少し真剣になった。

「何の話？」
「私、来月から転校することになったの」
「えっ、本当に？」

太郎は驚いた。

「お父さんの仕事の都合で...」
「そうなんだ...」
「寂しくなるわ」
「僕も寂しいよ」

しばらく沈黙が続いた。

「でも、友達はずっと友達よね？」
「もちろん！距離なんて関係ないよ」
「ありがとう、太郎」

二人は固い約束を交わした。`,

  ERROR_INDUCING: `エラーテスト用

これは意図的にエラーを発生させるためのテキストです。
特殊文字: @#$%^&*()
非常に短いテキスト。`,
}

export const TEST_CONFIGURATIONS = {
  FAST: {
    chunkSize: 1000,
    overlapSize: 100,
    demo: true,
  },
  NORMAL: {
    chunkSize: 5000,
    overlapSize: 500,
    demo: false,
  },
  DETAILED: {
    chunkSize: 10000,
    overlapSize: 1000,
    demo: false,
  },
}

/**
 * テスト用のヘルパー関数
 */
export class E2ETestHelpers {
  /**
   * ランダムなテストデータを生成
   */
  static generateRandomNovel(length: 'short' | 'medium' | 'long' = 'medium'): string {
    const characters = ['太郎', '花子', '次郎', '美咲', '健太']
    const settings = ['学校', '森', '城', '村', '街']
    const actions = ['歩いた', '走った', '話した', '笑った', '泣いた']

    const randomCharacter = characters[Math.floor(Math.random() * characters.length)]
    const randomSetting = settings[Math.floor(Math.random() * settings.length)]
    const randomAction = actions[Math.floor(Math.random() * actions.length)]

    const baseStory = `${randomCharacter}の物語

ある日、${randomCharacter}は${randomSetting}で${randomAction}。
これは${Date.now()}に生成されたテスト用の物語です。`

    switch (length) {
      case 'short':
        return baseStory
      case 'long':
        return baseStory.repeat(5)
      default:
        return baseStory.repeat(2)
    }
  }

  /**
   * APIレスポンス時間を測定
   */
  static async measureApiResponseTime<T>(
    apiCall: () => Promise<T>,
  ): Promise<{ result: T; responseTime: number }> {
    const startTime = Date.now()
    const result = await apiCall()
    const responseTime = Date.now() - startTime
    return { result, responseTime }
  }

  /**
   * テスト結果のスクリーンショットを撮影
   */
  static async captureTestEvidence(page: any, testName: string, step: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `test-results/${testName}-${step}-${timestamp}.png`
    await page.screenshot({ path: filename, fullPage: true })
    console.log(`Screenshot captured: ${filename}`)
  }

  /**
   * ネットワーク活動を監視
   */
  static setupNetworkMonitoring(page: any): {
    requests: any[]
    responses: any[]
    errors: any[]
  } {
    const monitoring = {
      requests: [] as any[],
      responses: [] as any[],
      errors: [] as any[],
    }

    page.on('request', (request: any) => {
      monitoring.requests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      })
    })

    page.on('response', (response: any) => {
      monitoring.responses.push({
        url: response.url(),
        status: response.status(),
        timestamp: Date.now(),
      })
    })

    page.on('requestfailed', (request: any) => {
      monitoring.errors.push({
        url: request.url(),
        error: request.failure(),
        timestamp: Date.now(),
      })
    })

    return monitoring
  }

  /**
   * テスト環境の準備
   */
  static async setupTestEnvironment(page: any): Promise<void> {
    // コンソールログの監視
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') {
        console.error(`Browser console error: ${msg.text()}`)
      }
    })

    // 未処理のエラーをキャッチ
    page.on('pageerror', (error: any) => {
      console.error(`Page error: ${error.message}`)
    })

    // デフォルトタイムアウトの設定
    page.setDefaultTimeout(30000)
  }

  /**
   * テスト後のクリーンアップ
   */
  static async cleanupTestData(novelIds: string[], jobIds: string[]): Promise<void> {
    // 実際の実装では、テスト用に作成されたデータをクリーンアップ
    console.log(`Cleaning up test data: ${novelIds.length} novels, ${jobIds.length} jobs`)

    // ここで実際のクリーンアップAPIを呼び出す
    // 例: await request.delete(`/api/test/cleanup`, { data: { novelIds, jobIds } })
  }

  /**
   * デモモードの設定確認
   */
  static isDemoMode(url: string): boolean {
    return url.includes('demo=1') || url.includes('demo=true')
  }

  /**
   * エラーメッセージの検証
   */
  static validateErrorMessage(errorText: string): boolean {
    const commonErrorPatterns = [
      /エラーが発生しました/,
      /サーバーエラー/,
      /処理に失敗しました/,
      /無効な入力です/,
      /Error:/,
      /Failed to/,
    ]

    return commonErrorPatterns.some((pattern) => pattern.test(errorText))
  }

  /**
   * テスト実行環境の情報を出力
   */
  static logTestEnvironment(): void {
    console.log('=== Test Environment ===')
    console.log(`Test run time: ${new Date().toISOString()}`)
    console.log(`Node.js version: ${process.version}`)
    console.log(`Platform: ${process.platform}`)
    console.log(`CI: ${process.env.CI ? 'Yes' : 'No'}`)
    console.log('========================')
  }
}
