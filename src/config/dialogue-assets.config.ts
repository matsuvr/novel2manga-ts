// 設定集中: Dialogue縦書きアセット関連のマジックナンバーをここで一元管理
// 他ファイルからは本定義のみ参照し、直接数値を埋め込まないこと
export const dialogueAssetsConfig = {
  batch: {
    limit: 50 as const, // vertical-text batch API の上限
    adaptive: {
      enabled: true as const,
      initial: 24 as const,
      min: 8 as const,
      max: 50 as const,
      slowThresholdMs: 450 as const, // 1 バッチあたり遅いと見なす閾値
      fastThresholdMs: 120 as const, // 速すぎたら増やす評価閾値
      adjustFactor: 0.5 as const, // 遅いときに *0.5, 速いとき + (current*0.25) などで利用予定
    },
  },
  testPlaceholder: {
    minHeight: 40, // テスト時プレースホルダ画像の最低高さ
  },
} as const

export type DialogueAssetsConfig = typeof dialogueAssetsConfig
