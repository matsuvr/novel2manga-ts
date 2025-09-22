/**
 * Prompt builders for short-text AI expansion flow.
 * 短い入力(例: 500〜1000文字未満)をベースに、約 targetChars 文字のマンガ化しやすいシナリオへ拡張する。
 * 出力はプレーンテキスト（段落のみ, 見出し/箇条書き/JSON禁止）。
 */

export function buildAIExpansionSystem(targetChars: number) {
  return `あなたは熟練の脚本家です。ユーザーの短い入力を手がかりに、\n約${targetChars}文字の日本語シナリオ（マンガ化しやすい地の文 + 必要最低限のセリフ）を書いてください。\n制約:\n- 箇条書き/見出し/番号リスト/JSON禁止。段落構成のみ。\n- 起承転結と場面の切り替えを明確に。\n- 登場人物は 2〜4 名に抑え、セリフは自然で読みやすく。\n- 長すぎる固有名詞や複雑な世界観の過剰導入を避ける。\n- 過度なメタ発言禁止。\n- 目標文字数は±10% 以内。`.
    trim()
}

export function buildAIExpansionUser(shortInput: string) {
  return `【元の短い入力】\n${shortInput}\n\n【要件】\n- 上記の核となる要素(登場人物/状況/雰囲気)を尊重しつつ不足部分を創造的に補完。\n- 読後に小さな余韻が残るワンエピソード完結。\n- プレーンテキストのみ。`.
    trim()
}

export const AI_EXPANSION_GEN_CFG = {
  temperature: 0.7,
  maxTokens: 2048,
} as const
