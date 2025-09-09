/**
 * Extraction V2 Prompts Configuration
 * Character-stateful extraction prompts for text analysis
 */

import type {
  CharacterCandidateV2,
  CharacterEventV2,
  CharacterMemoryPromptJson,
  DialogueV2,
  HighlightV2,
  SceneV2,
  SituationV2,
  TempCharacterId,
} from '@/types/extractionV2'
import { isCharacterId, isTempCharacterId } from '@/types/extractionV2'

/**
 * Generate the system prompt for V2 extraction
 */
export function getExtractionV2SystemPrompt(): string {
  return `これは長文テキストの一部分（=チャンク）です。以下の要素を抽出してください。人物だけは「前回までの人物メモリ」を参照して同一人物かどうかを判定し、必要に応じて新規人物の仮IDを発行してください。分析対象は「対象」チャンクのみです（前/次は文脈把握のためだけに使用）。

出力は必ず次の JSON 形式（v2）のみ。説明文や余計な文字は出力禁止。未知フィールド禁止。すべて日本語で出力。入力が日本語以外の場合は現代日本語口語訳で出力。

{
  "characters": [
    {
      "id": "char_既存ID または temp_char_<chunkIndex>_<連番>",
      "name": "このチャンクで確認できた呼称（不明な場合は「不明」）",
      "aliases": ["別名や肩書き（なければ空配列）"],
      "description": "このチャンクで新たに判明/確証された人物情報（50〜120字）",
      "firstAppearanceChunk": 0,         // 新規人物なら現在の chunkIndex、既知なら null
      "firstAppearance": 0,              // 新規人物なら対象テキスト内の最初の出現インデックス、既知なら null
      "possibleMatchIds": [              // 既存人物候補（なければ空配列）
        {"id": "char_XX", "confidence": 0.0} // 0.0〜1.0
      ]
    }
  ],
  "characterEvents": [
    {
      "characterId": "char_既存ID または temp_char_<chunkIndex>_<連番> または 不明",
      "action": "このチャンクでその人物が行った/言った/判明したことを簡潔に記述（1文）",
      "index": 0                         // 対象テキスト内の先頭文字インデックス（0起点）
    }
  ],
  "scenes": [
    {
      "location": "場所",
      "time": "時間 または null",
      "description": "場面の要約（1〜2文）",
      "startIndex": 0,                   // 対象テキスト内の開始位置（0起点、包含）
      "endIndex": 0                      // 対象テキスト内の終了位置（排他的）
    }
  ],
  "dialogues": [
    {
      "speakerId": "char_既存ID または temp_char_<chunkIndex>_<連番> または \"不明\"",
      "text": "セリフ本文（入力が他言語なら日本語訳）",
      "emotion": "感情（例: 中立/喜び/怒り/悲しみ/驚き/恐れ/嫌悪/不明 など自由記述）",
      "index": 0
    }
  ],
  "highlights": [
    {
      "type": "climax" | "turning_point" | "emotional_peak" | "action_sequence",
      "description": "重要な出来事の要約（1文）",
      "importance": 1,                   // 1〜5 の整数で重要度（5が最大）
      "startIndex": 0,
      "endIndex": 0
    }
  ],
  "situations": [
    {"description": "状況説明（出来事の流れ・因果が分かるよう簡潔に）", "index": 0}
  ],
  "pacing": "マンガとしてのペース（任意。コマ割り・密度感などを短く）"
}

厳守事項:
- 必ず "situations" フィールドを含めること。
- インデックス規約: すべて対象テキストに対する 0 起点。startIndex は包含、endIndex は排他的。
- 時間や場所が不明確な場合は time を null または「不明」にする。
- 登場人物の同一性判定:
  - 「人物メモリ」に同一候補がある場合は、その既存ID（例: char_12）を "id" や "speakerId" に用いる。
  - 不明/新規の場合は temp_char_<chunkIndex>_<連番> を発行し、"characters" に登録する。
  - 既存候補があるが確信度が低い場合は "possibleMatchIds" に列挙（confidence 0.0〜1.0）。
- "characters" には「このチャンクで新たに登場した人物」または「既知だが新情報を得た人物」のみを含める。単に再登場しただけで新情報がない既知人物は "characters" に入れず、"characterEvents" と "dialogues" で参照する。
- "dialogues.text" は必要に応じて日本語訳にし、原文のニュアンスを保ちつつ簡潔に。
- 説明文や JSON 以外の出力は厳禁。未知のプロパティ禁止。すべて日本語で出力。`
}

/**
 * Generate the user prompt template for V2 extraction
 */
export function getExtractionV2UserPromptTemplate(): string {
  return `チャンク{{chunkIndex}}:

[人物メモリ（前回までの確定情報・JSON）]
{{previousCharacterMemoryJson}}

前要約: {{previousChunkSummary}}
対象: {{chunkText}}
次要約: {{nextChunkSummary}}

指示:
- 分析対象は「対象」のみ。前/次は同一人物判定や話の流れ把握にのみ使用。
- 既知人物は "人物メモリ" の ID（例: char_12）を使用。不明/新規なら temp_char_{{chunkIndex}}_1, _2... を発行。
- "characters" には新登場または新情報のある人物のみを入れる。再登場のみの場合は "characterEvents" / "dialogues" で参照。
- 出力は必ず JSON（v2）**のみ**。`
}

/**
 * Format character memory for prompt inclusion
 */
export function formatCharacterMemoryForPrompt(memory: CharacterMemoryPromptJson[]): string {
  if (memory.length === 0) {
    return '[]'
  }

  // Compact JSON format to save tokens
  const compactMemory = memory.map((char) => ({
    id: char.id,
    names: char.names.slice(0, 3), // Limit aliases
    summary: char.summary.substring(0, 150), // Truncate summary
    lastSeen: char.lastSeenChunk,
  }))

  return JSON.stringify(compactMemory, null, 0) // No formatting to save tokens
}

/**
 * Generate the complete user prompt for extraction
 */
export function generateExtractionV2UserPrompt(
  chunkIndex: number,
  chunkText: string,
  previousChunkSummary: string,
  nextChunkSummary: string,
  characterMemory: CharacterMemoryPromptJson[],
): string {
  const template = getExtractionV2UserPromptTemplate()
  const memoryJson = formatCharacterMemoryForPrompt(characterMemory)

  return template
    .replace(/\{\{chunkIndex\}\}/g, chunkIndex.toString())
    .replace('{{previousCharacterMemoryJson}}', memoryJson)
    .replace('{{previousChunkSummary}}', previousChunkSummary || '（なし）')
    .replace('{{chunkText}}', chunkText)
    .replace('{{nextChunkSummary}}', nextChunkSummary || '（なし）')
}

/**
 * Migration helper: Update old extraction format to V2
 * This is a temporary helper for backward compatibility
 */
type OldCharacter = { name?: string; description?: string; firstAppearance?: number }
type OldDialogue = { speakerId?: string; text: string; emotion?: string; index?: number }
type OldExtraction = {
  characters?: OldCharacter[]
  dialogues?: OldDialogue[]
  scenes?: unknown[]
  highlights?: unknown[]
  situations?: unknown[]
  pacing?: string
}

export function migrateOldExtractionToV2(
  oldExtraction: OldExtraction | Record<string, unknown>,
  chunkIndex: number,
): import('@/types/extractionV2').ExtractionV2 {
  // Handle old format characters
  const oldChars: OldCharacter[] = Array.isArray((oldExtraction as OldExtraction).characters)
    ? ((oldExtraction as OldExtraction).characters as OldCharacter[])
    : []

  const characters: CharacterCandidateV2[] = oldChars.map((char: OldCharacter, index: number) => ({
    id: `temp_char_${chunkIndex}_${index + 1}` as TempCharacterId,
    name: char.name || '不明',
    aliases: [],
    description: char.description || '',
    firstAppearanceChunk: chunkIndex,
    firstAppearance: char.firstAppearance ?? 0,
    possibleMatchIds: [],
  }))

  // Convert old dialogues format
  const oldDialogs: OldDialogue[] = Array.isArray((oldExtraction as OldExtraction).dialogues)
    ? ((oldExtraction as OldExtraction).dialogues as OldDialogue[])
    : []

  const dialogues: DialogueV2[] = oldDialogs.map((dialogue: OldDialogue) => {
    const rawId = dialogue.speakerId ?? '不明'
    const speakerId = isCharacterId(rawId)
      ? rawId
      : isTempCharacterId(rawId)
        ? (rawId as TempCharacterId)
        : ('不明' as const)
    return {
      speakerId,
      text: dialogue.text,
      emotion: dialogue.emotion || '不明',
      index: dialogue.index ?? 0,
    }
  })

  // Extract character events from old format (if available)
  const characterEvents: CharacterEventV2[] = []
  for (const char of oldChars) {
    if (char.name) {
      const idx = characters.findIndex((c) => c.name === (char.name ?? ''))
      const tempId = `temp_char_${chunkIndex}_${idx + 1}` as TempCharacterId
      characterEvents.push({
        characterId: tempId,
        action: `初登場`,
        index: char.firstAppearance ?? 0,
      })
    }
  }

  // Return V2 format
  return {
    characters,
    characterEvents,
    scenes: ((oldExtraction as OldExtraction).scenes ?? []) as SceneV2[],
    dialogues,
    highlights: ((oldExtraction as OldExtraction).highlights ?? []) as HighlightV2[],
    situations: ((oldExtraction as OldExtraction).situations ?? []) as SituationV2[],
    pacing: (oldExtraction as OldExtraction).pacing,
  }
}
