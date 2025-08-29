import type { Script, ScriptLine, ScriptV2, ScriptV2Line } from '@/types/script'

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

export function toLegacyScenes(v2: ScriptV2): Script {
  const groups = new Map<number, ScriptLine[]>()
  for (const line of v2.script) {
    const idx = Number.isFinite(line.sceneIndex) ? (line.sceneIndex as number) : 1
    const arr = groups.get(idx) || []
    arr.push({
      index: undefined,
      type: line.type as ScriptLine['type'],
      speaker: isNonEmptyString(line.speaker) ? line.speaker : undefined,
      character: isNonEmptyString(line.character) ? line.character : undefined,
      text: line.text,
      sourceStart: line.sourceStart,
      sourceEnd: line.sourceEnd,
      sourceQuote: line.sourceQuote,
      isContinuation: line.isContinuation,
    })
    groups.set(idx, arr)
  }

  const scenes = Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sceneIndex, script]) => ({ id: String(sceneIndex), script }))

  return {
    title: v2.title,
    scenes,
    coverageStats: v2.coverageStats,
    needsRetry: v2.needsRetry,
  }
}

export function fromLegacyScenes(legacy: Script): ScriptV2 {
  const script: ScriptV2Line[] = []
  let sceneCounter = 0
  for (const scene of legacy.scenes || []) {
    const sceneIndex = ++sceneCounter
    for (const line of scene.script || []) {
      script.push({
        sceneIndex,
        type: line.type as ScriptV2Line['type'],
        speaker: line.speaker,
        character: line.character,
        text: line.text,
        sourceStart: line.sourceStart,
        sourceEnd: line.sourceEnd,
        sourceQuote: line.sourceQuote,
        isContinuation: line.isContinuation,
      })
    }
  }
  return {
    title: legacy.title,
    script,
    coverageStats: legacy.coverageStats,
    needsRetry: legacy.needsRetry,
  }
}
