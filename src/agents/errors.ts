export enum AgentErrorType {
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  SCHEMA_VALIDATION_ERROR = 'SCHEMA_VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}

export class AgentError extends Error {
  constructor(
    public readonly type: AgentErrorType,
    message: string,
    public readonly provider?: string,
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'AgentError'
  }

  static fromJsonParseError(error: unknown, provider?: string): AgentError {
    const message = error instanceof Error ? error.message : String(error)
    return new AgentError(
      AgentErrorType.JSON_PARSE_ERROR,
      `Failed to parse JSON response: ${message}`,
      provider,
      error,
    )
  }

  static fromSchemaValidationError(error: unknown, provider?: string): AgentError {
    const message = error instanceof Error ? error.message : String(error)
    return new AgentError(
      AgentErrorType.SCHEMA_VALIDATION_ERROR,
      `Schema validation failed: ${message}`,
      provider,
      error,
    )
  }

  static fromProviderError(error: unknown, provider: string): AgentError {
    const message = error instanceof Error ? error.message : String(error)
    return new AgentError(
      AgentErrorType.PROVIDER_ERROR,
      `Provider error: ${message}`,
      provider,
      error,
    )
  }
}
