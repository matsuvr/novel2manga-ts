import fs from 'node:fs'
import path from 'node:path'

/**
 * Loads external prompt files from the prompts directory
 * This enforces CLAUDE.md CONFIG CENTRALIZATION rule by externalizing large prompts
 */
export function loadPrompt(filename: string): string {
  const promptsDir = path.join(__dirname)
  const filePath = path.join(promptsDir, filename)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filename}`)
  }

  return fs.readFileSync(filePath, 'utf-8').trim()
}

/**
 * Panel assignment prompts
 */
export const panelAssignmentPrompts = {
  systemPrompt: loadPrompt('panel-assignment-system.txt'),
  userPromptTemplate: loadPrompt('panel-assignment-user-template.txt'),
}
