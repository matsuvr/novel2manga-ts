/**
 * Build mapping from panel index ranges to chunk indices.
 * Returns array of { chunkIndex, startPanel, endPanel } where panels are 1-based indices.
 */
export async function buildPanelToChunkMapping(
  jobId: string,
  totalChunks: number,
  logger?: {
    info?: (msg: string, meta?: Record<string, unknown>) => void
    warn?: (msg: string, meta?: Record<string, unknown>) => void
  },
): Promise<Array<{ chunkIndex: number; startPanel: number; endPanel: number }>> {
  const mapping: Array<{ chunkIndex: number; startPanel: number; endPanel: number }> = []
  let currentPanelIndex = 1

  const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
  const storage = await StorageFactory.getAnalysisStorage()

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const key = JsonStorageKeys.scriptChunk(jobId, chunkIndex)
    const obj = await storage.get(key)

    if (!obj) {
      logger?.warn?.('Missing script chunk for panel mapping', { jobId, chunkIndex })
      continue
    }

    let panelCount = 0
    try {
      const scriptObj = JSON.parse(obj.text)
      panelCount = Array.isArray(scriptObj.panels) ? scriptObj.panels.length : 0
    } catch (_parseError) {
      logger?.warn?.('Failed to parse script chunk for panel mapping', { jobId, chunkIndex })
      continue
    }

    if (panelCount > 0) {
      const startPanel = currentPanelIndex
      const endPanel = currentPanelIndex + panelCount - 1
      mapping.push({ chunkIndex, startPanel, endPanel })
      currentPanelIndex = endPanel + 1
    }
  }

  logger?.info?.('Built panel to chunk mapping', {
    jobId,
    totalMappings: mapping.length,
    totalPanels: currentPanelIndex - 1,
  })

  return mapping
}

export function getChunkForPanel(
  mapping: Array<{ chunkIndex: number; startPanel: number; endPanel: number }>,
  panelIndex: number,
): number {
  const chunk = mapping.find((m) => panelIndex >= m.startPanel && panelIndex <= m.endPanel)
  return chunk ? chunk.chunkIndex : 0
}
