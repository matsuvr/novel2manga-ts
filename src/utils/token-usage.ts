export type TokenUsageRow = {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function groupByProviderModel(
  rows: TokenUsageRow[],
): Record<string, { prompt: number; completion: number; total: number }> {
  return rows.reduce(
    (acc, r) => {
      const key = `${r.provider} ${r.model}`
      if (!acc[key]) acc[key] = { prompt: 0, completion: 0, total: 0 }
      acc[key].prompt += r.promptTokens
      acc[key].completion += r.completionTokens
      acc[key].total += r.totalTokens
      return acc
    },
    {} as Record<string, { prompt: number; completion: number; total: number }>,
  )
}
