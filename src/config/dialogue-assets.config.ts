// 設定集中: Dialogue縦書きアセット関連のマジックナンバーをここで一元管理
// 他ファイルからは本定義のみ参照し、直接数値を埋め込まないこと
export const dialogueAssetsConfig = {
  batch: {
    limit: 50 as const, // vertical-text batch API の上限
  },
  testPlaceholder: {
    minHeight: 40, // テスト時プレースホルダ画像の最低高さ
  },
} as const

export type DialogueAssetsConfig = typeof dialogueAssetsConfig
