// Shared ID utilities for entity identifiers. Strict types, no any.

// Episode ID has the form: `${jobId}-ep${episodeNumber}`
export type EpisodeId = `${string}-ep${number}`

export function makeEpisodeId(jobId: string, episodeNumber: number): EpisodeId {
  return `${jobId}-ep${episodeNumber}` as EpisodeId
}

export function isEpisodeId(value: string): value is EpisodeId {
  return /.+-ep\d+$/.test(value)
}
