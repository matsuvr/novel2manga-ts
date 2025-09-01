import type { LoggerPort } from './logger'
import { getLogger } from './logger'

/**
 * Standardized context keys for consistent logging across the application
 */
export interface LoggingContext {
  // Business identifiers
  jobId?: string
  novelId?: string
  episodeNumber?: number
  chunkIndex?: number
  pageNumber?: number

  // Service/component identifiers
  service?: string
  operation?: string
  route?: string
  method?: string

  // Agent/step identifiers
  agent?: string
  stepName?: string

  // Additional context
  [key: string]: unknown
}

/**
 * Create a logger for API routes
 */
export function forApiRoute(
  route: string,
  method: string,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    route,
    method,
    ...additionalContext,
  })
}

/**
 * Create a logger for job-related operations with both jobId and novelId
 */
export function forJob(
  jobId: string,
  novelId: string,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    jobId,
    novelId,
    ...additionalContext,
  })
}

/**
 * Create a logger for pipeline steps with full context
 */
export function forStep(
  stepName: string,
  jobId: string,
  novelId: string,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    stepName,
    jobId,
    novelId,
    ...additionalContext,
  })
}

/**
 * Create a logger for services with operation context
 */
export function forService(
  service: string,
  operation: string,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    service,
    operation,
    ...additionalContext,
  })
}

/**
 * Create a logger for agents with agent-specific context
 */
export function forAgent(agent: string, additionalContext?: LoggingContext): LoggerPort {
  return getLogger().withContext({
    agent,
    ...additionalContext,
  })
}

/**
 * Create a logger for LLM operations with model context
 */
export function forLlm(
  provider: string,
  model: string,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    service: `llm-${provider}`,
    model,
    ...additionalContext,
  })
}

/**
 * Create a logger with episode-specific context
 */
export function forEpisode(
  jobId: string,
  novelId: string,
  episodeNumber: number,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    jobId,
    novelId,
    episodeNumber,
    ...additionalContext,
  })
}

/**
 * Create a logger with chunk-specific context
 */
export function forChunk(
  jobId: string,
  novelId: string,
  chunkIndex: number,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    jobId,
    novelId,
    chunkIndex,
    ...additionalContext,
  })
}

/**
 * Create a logger with page-specific context
 */
export function forPage(
  jobId: string,
  novelId: string,
  episodeNumber: number,
  pageNumber: number,
  additionalContext?: LoggingContext,
): LoggerPort {
  return getLogger().withContext({
    jobId,
    novelId,
    episodeNumber,
    pageNumber,
    ...additionalContext,
  })
}

/**
 * Generic factory method for custom contexts
 */
export function withContext(context: LoggingContext): LoggerPort {
  return getLogger().withContext(context)
}

/**
 * Convenience namespace object for all factory functions
 */
export const LoggerFactory = {
  forApiRoute,
  forJob,
  forStep,
  forService,
  forAgent,
  forLlm,
  forEpisode,
  forChunk,
  forPage,
  withContext,
}

/**
 * Helper function to extract job context from StepContext
 */
export function createStepLogger(stepContext: {
  jobId: string
  novelId: string
  stepName?: string
}): LoggerPort {
  return forJob(stepContext.jobId, stepContext.novelId, { stepName: stepContext.stepName })
}
