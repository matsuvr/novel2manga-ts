/**
 * Unit Test Setup Configuration
 *
 * Configures all necessary mocks for unit testing including
 * database, authentication, and external service mocks.
 *
 * This setup ensures consistent mock behavior across all unit tests
 * and follows established patterns for new tests.
 */

import { beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom'

// Configure database mocks
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  const {
    mockDatabase,
    users,
    jobs,
    novels,
    episodes,
    chunks,
    outputs,
    chunkAnalysisStatus,
    layoutStatus,
    renderStatus,
    jobStepHistory,
    tokenUsage,
    storageFiles,
    accounts,
    sessions,
    verificationTokens,
    authenticators,
    schema,
    getDatabase,
    shouldRunMigrations,
  } = await import('@test/mocks/database.mock')

  return {
    ...actual,
    // Export all table mocks with correct names
    users,
    jobs,
    novels,
    episodes,
    chunks,
    outputs,
    chunkAnalysisStatus,
    layoutStatus,
    renderStatus,
    jobStepHistory,
    tokenUsage,
    storageFiles,
    accounts,
    sessions,
    verificationTokens,
    authenticators,

    // Export database functions
    getDatabase,
    shouldRunMigrations,
    schema,

    // Default export
    default: mockDatabase,
  }
})

// Configure database services mocks
vi.mock('@/services/database', async () => {
  const {
    mockDatabase,
    mockDatabaseServiceFactory,
    mockInitializeDatabaseServiceFactory,
    mockGetDatabaseServiceFactory,
    mockIsFactoryInitialized,
    mockCleanup,
    MockDatabaseService,
  } = await import('@test/mocks/database-services.mock')

  return {
    // Service factory exports
    db: mockDatabase,
    DatabaseServiceFactory: vi.fn().mockImplementation(() => mockDatabaseServiceFactory),
    initializeDatabaseServiceFactory: mockInitializeDatabaseServiceFactory,
    getDatabaseServiceFactory: mockGetDatabaseServiceFactory,
    isFactoryInitialized: mockIsFactoryInitialized,
    cleanup: mockCleanup,

    // Legacy DatabaseService
    DatabaseService: MockDatabaseService,

    // Individual service classes (mocked)
    BaseDatabaseService: vi.fn(),
    ChunkDatabaseService: vi.fn(),
    EpisodeDatabaseService: vi.fn(),
    JobDatabaseService: vi.fn(),
    LayoutDatabaseService: vi.fn(),
    NovelDatabaseService: vi.fn(),
    OutputDatabaseService: vi.fn(),
    RenderDatabaseService: vi.fn(),
    TransactionService: vi.fn(),
  }
})

// Configure database service factory mock
vi.mock('@/services/database/database-service-factory', async () => {
  const {
    mockDatabase,
    mockDatabaseServiceFactory,
    mockInitializeDatabaseServiceFactory,
    mockGetDatabaseServiceFactory,
    mockIsFactoryInitialized,
    mockCleanup,
  } = await import('@test/mocks/database-services.mock')

  return {
    db: mockDatabase,
    DatabaseServiceFactory: vi.fn().mockImplementation(() => mockDatabaseServiceFactory),
    initializeDatabaseServiceFactory: mockInitializeDatabaseServiceFactory,
    getDatabaseServiceFactory: mockGetDatabaseServiceFactory,
    isFactoryInitialized: mockIsFactoryInitialized,
    cleanup: mockCleanup,
  }
})

// Mock authentication modules
vi.mock('next-auth', () => ({
  default: vi.fn(),
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  }),
}))

vi.mock('next-auth/providers/google', () => ({
  default: vi.fn().mockReturnValue({
    id: 'google',
    name: 'Google',
    type: 'oauth',
  }),
}))

// Mock server auth module
vi.mock('@/server/auth', async () => {
  const {
    ApiError,
    AuthenticationError,
    effectToApiResponse,
    withAuth,
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
  } = await import('@test/mocks/auth.mock')

  return {
    ApiError,
    AuthenticationError,
    effectToApiResponse,
    withAuth,
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
    auth: vi.fn().mockResolvedValue({
      user: {
        id: 'mock-user-id',
        email: 'mock@example.com',
        name: 'Mock User',
        image: null,
      },
    }),
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
  }
})

// Mock auth.ts module
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// Mock API error handling modules
vi.mock('@/server/auth/effectToApiResponse', async () => {
  const { ApiError, effectToApiResponse, withAuth } = await import(
    '@test/mocks/effectToApiResponse.mock'
  )
  return {
    ApiError,
    effectToApiResponse,
    withAuth,
  }
})

vi.mock('@/server/auth/requireAuth', async () => {
  const { requireAuth, requireAuthWithBypass, getSearchParamsFromRequest, AuthenticationError } =
    await import('@test/mocks/auth.mock')
  return {
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
    AuthenticationError,
  }
})

// Mock email service
vi.mock('@/services/email', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    sendJobCompletionNotification: vi.fn().mockResolvedValue(undefined),
    sendJobFailureNotification: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock notification service
vi.mock('@/services/notification/service', () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    sendJobCompletionNotification: vi.fn().mockResolvedValue(undefined),
  })),
  notificationService: {
    sendJobCompletionNotification: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/notification/integration', () => ({
  sendJobNotification: vi.fn().mockImplementation(() => Promise.resolve()),
  updateJobStatusWithNotification: vi
    .fn()
    .mockImplementation(async (updateFn, jobId, status, error) => {
      await updateFn(jobId, status, error)
    }),
}))

// Mock file system operations
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('mock file content'),
    writeFileSync: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn().mockReturnValue([]),
    promises: {
      readFile: vi.fn().mockResolvedValue('mock file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
    },
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('mock file content'),
  writeFileSync: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn().mockReturnValue([]),
  promises: {
    readFile: vi.fn().mockResolvedValue('mock file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}))

// Mock path operations
vi.mock('node:path', () => ({
  default: {
    join: vi.fn().mockImplementation((...args) => args.join('/')),
    resolve: vi.fn().mockImplementation((...args) => args.join('/')),
    dirname: vi.fn().mockReturnValue('/mock/dir'),
    basename: vi.fn().mockReturnValue('mock-file.txt'),
    extname: vi.fn().mockReturnValue('.txt'),
  },
  join: vi.fn().mockImplementation((...args) => args.join('/')),
  resolve: vi.fn().mockImplementation((...args) => args.join('/')),
  dirname: vi.fn().mockReturnValue('/mock/dir'),
  basename: vi.fn().mockReturnValue('mock-file.txt'),
  extname: vi.fn().mockReturnValue('.txt'),
}))

// Mock configuration modules
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isDevelopment: vi.fn().mockReturnValue(false),
    getDatabaseConfig: vi.fn().mockReturnValue({
      sqlite: {
        path: ':memory:',
      },
    }),
    getAppConfig: vi.fn().mockReturnValue({
      features: {
        enableCoverageCheck: false,
      },
      llm: {
        scriptConversion: {
          coverageThreshold: 0.8,
          enableCoverageRetry: true,
        },
      },
    }),
    getTextAnalysisConfig: vi.fn().mockReturnValue({
      userPromptTemplate: '{{chunkIndex}}',
      systemPrompt: 'mock system prompt',
    }),
    getScriptConversionConfig: vi.fn().mockReturnValue({
      userPromptTemplate: '{{chunkIndex}}',
      systemPrompt: 'mock system prompt',
    }),
    getEpisodeConfig: vi.fn().mockReturnValue({
      smallPanelThreshold: 8,
      minPanelsPerEpisode: 10,
      maxPanelsPerEpisode: 1000,
    }),
  }
})

vi.mock('@/config/app.config', () => ({
  appConfig: {
    chunking: {
      defaultChunkSize: 1000,
    },
    rendering: {
      limits: {
        maxPages: 100,
      },
      defaultPageSize: {
        width: 1024,
        height: 768,
      },
      canvas: {
        bubble: {
          strokeStyle: 'black',
          fillStyle: 'white',
          thoughtShape: {
            bumps: 6,
            seedScale: 100,
            sinScale: 10,
          },
        },
        sfx: {
          rotation: {
            enabled: true,
          },
        },
        font: {
          maxCharsPerLine: 20,
          fontSize: 20,
        },
      },
      verticalText: {
        enabled: true,
      },
    },
    ui: {
      progress: {
        currentEpisodeProgressWeight: 0.5,
        defaultEpisodeNumber: 1,
      },
      logs: {
        maxEntries: 100,
        maxVisibleLogHeightVh: 30,
      },
    },
    scriptConstraints: {
      dialogue: {
        maxCharsPerBubble: 50,
        splitPolicy: 'split-panel',
        continuationPanelCutText: '前のコマを引き継ぐ',
        applyToTypes: ['speech', 'thought', 'narration'],
      },
    },
    features: {
      enableCoverageCheck: false,
    },
    llm: {
      scriptConversion: {
        coverageThreshold: 0.8,
        enableCoverageRetry: true,
        systemPrompt: 'mock system prompt',
      },
    },
    episode: {
      smallPanelThreshold: 8,
      minPanelsPerEpisode: 10,
      maxPanelsPerEpisode: 1000,
    },
  },
  getAppConfig: vi.fn().mockReturnValue({
    features: {
      enableCoverageCheck: false,
    },
    llm: {
      scriptConversion: {
        coverageThreshold: 0.8,
        enableCoverageRetry: true,
        systemPrompt: 'mock system prompt',
      },
    },
    episode: {
      smallPanelThreshold: 8,
      minPanelsPerEpisode: 10,
      maxPanelsPerEpisode: 1000,
    },
  }),
  getAppConfigWithOverrides: vi.fn().mockReturnValue({
    chunking: {
      defaultChunkSize: 1000,
    },
    rendering: {
      limits: {
        maxPages: 100,
      },
      defaultPageSize: {
        width: 1024,
        height: 768,
      },
      canvas: {
        bubble: {
          strokeStyle: 'black',
          fillStyle: 'white',
          thoughtShape: {
            bumps: 6,
            seedScale: 100,
            sinScale: 10,
          },
        },
        sfx: {
          rotation: {
            enabled: true,
          },
        },
        font: {
          maxCharsPerLine: 20,
          fontSize: 20,
        },
      },
      verticalText: {
        enabled: true,
      },
    },
    scriptConstraints: {
      dialogue: {
        maxCharsPerBubble: 50,
        splitPolicy: 'split-panel',
        continuationPanelCutText: '前のコマを引き継ぐ',
        applyToTypes: ['speech', 'thought', 'narration'],
      },
    },
    features: {
      enableCoverageCheck: false,
    },
    llm: {
      scriptConversion: {
        coverageThreshold: 0.8,
        enableCoverageRetry: true,
        systemPrompt: 'mock system prompt',
        userPromptTemplate: 'mock user prompt',
      },
    },
    episode: {
      smallPanelThreshold: 8,
      minPanelsPerEpisode: 10,
      maxPanelsPerEpisode: 1000,
    },
  }),
}))

// Mock external services
vi.mock('@/services/llm', () => ({
  LLMService: vi.fn().mockImplementation(() => ({
    generateText: vi.fn().mockResolvedValue('Mock generated text'),
    analyzeChunk: vi.fn().mockResolvedValue({ analysis: 'mock analysis' }),
  })),
}))

// Mock logging
vi.mock('@/logging', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock user service types (ensure error classes are available)
vi.mock('@/services/user/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/user/types')>()
  return {
    ...actual,
    // Re-export all error classes to ensure they're available in tests
    DatabaseError: actual.DatabaseError,
    UserNotFoundError: actual.UserNotFoundError,
    ValidationError: actual.ValidationError,
  }
})

// Provide a stable default mock for CanvasRenderer unless explicitly disabled.
// Default: use real CanvasRenderer. Enable mock only when explicitly requested.
if (process.env.CANVAS_RENDERER_MOCK === '1') {
  vi.mock('@/lib/canvas/canvas-renderer', () => {
    const make2dContext = () => ({
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      resetTransform: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 10 }) as TextMetrics),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      drawImage: vi.fn(),
      font: '16px sans-serif',
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
    })

    const mockInstance = {
      setDialogueAssets: vi.fn(),
      renderMangaLayout: vi.fn(),
      toBlob: vi.fn().mockResolvedValue(new Blob()),
      canvas: {
        width: 800,
        height: 600,
        getContext: (_type?: unknown) => make2dContext(),
        toDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
      },
    }

    return {
      CanvasRenderer: {
        create: vi.fn().mockResolvedValue(mockInstance),
        createImageFromBuffer: vi.fn().mockResolvedValue({
          image: { __img: true } as unknown as CanvasImageSource,
          width: 200,
          height: 300,
        }),
      },
    }
  })
}

// Setup function to reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()

  // Reset environment variables to test defaults
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'warn'
})
