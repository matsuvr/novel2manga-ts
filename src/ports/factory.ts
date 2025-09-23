import { DrizzleEpisodePort } from '@/infrastructure/ports/drizzle-episode-port'
import { FileSystemScriptPort } from '@/infrastructure/ports/fs-script-port'
import type { EpisodePort } from './episode-port'
import type { ScriptPort } from './script-port'

interface PortsBundle {
  episode: EpisodePort
  script: ScriptPort
}

let _ports: PortsBundle | null = null

export function getPorts(): PortsBundle {
  if (_ports) return _ports
  _ports = {
    episode: new DrizzleEpisodePort(),
    script: new FileSystemScriptPort(),
  }
  return _ports
}

export function setPortsForTest(override: Partial<PortsBundle>): void {
  _ports = { ...getPorts(), ...override }
}
