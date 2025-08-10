import { Agent } from '@mastra/core'
import { getLLM } from '@/utils/llm-factory'

export abstract class BaseAgent extends Agent {
  constructor(
    name: string,
    instructions: () => string,
    llmUseCase: Parameters<typeof getLLM>[0],
    description?: string,
  ) {
    super({
      name,
      description,
      instructions,
      model: async () => {
        const llm = await getLLM(llmUseCase)
        console.log(`[${name}] Using provider: ${llm.providerName}`)
        console.log(`[${name}] Using model: ${llm.model}`)
        return llm.provider(llm.model)
      },
    })
  }
}
