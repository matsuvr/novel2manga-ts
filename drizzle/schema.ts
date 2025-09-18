import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const chunkAnalysisStatus = sqliteTable(
  'chunk_analysis_status',
  {
    id: text().primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    isAnalyzed: integer('is_analyzed').default(0),
    analysisPath: text('analysis_path'),
    analyzedAt: text('analyzed_at'),
    retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('unique_job_chunk_analysis').on(table.jobId, table.chunkIndex),
    index('idx_chunk_analysis_status_job_id').on(table.jobId),
  ],
)

export const chunks = sqliteTable(
  'chunks',
  {
    id: text().primaryKey().notNull(),
    novelId: text('novel_id').references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    contentPath: text('content_path').notNull(),
    startPosition: integer('start_position').notNull(),
    endPosition: integer('end_position').notNull(),
  wordCount: integer('word_count'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('unique_job_chunk').on(table.jobId, table.chunkIndex),
    index('idx_chunks_job_id').on(table.jobId),
    index('idx_chunks_novel_id').on(table.novelId),
  ],
)

export const episodes = sqliteTable(
  'episodes',
  {
    id: text().primaryKey().notNull(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    title: text(),
    summary: text(),
    startChunk: integer('start_chunk').notNull(),
    startCharIndex: integer('start_char_index').notNull(),
    endChunk: integer('end_chunk').notNull(),
    endCharIndex: integer('end_char_index').notNull(),
  confidence: real().notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    episodeTextPath: text('episode_text_path'),
  },
  (table) => [
    uniqueIndex('unique_job_episode').on(table.jobId, table.episodeNumber),
    index('idx_episodes_job_id').on(table.jobId),
    index('idx_episodes_novel_id').on(table.novelId),
  ],
)

export const jobStepHistory = sqliteTable(
  'job_step_history',
  {
    id: text().primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    stepName: text('step_name').notNull(),
    status: text().notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationSeconds: integer('duration_seconds'),
    inputPath: text('input_path'),
    outputPath: text('output_path'),
    errorMessage: text('error_message'),
  metadata: text(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_job_step_history_job_id').on(table.jobId)],
)

export const layoutStatus = sqliteTable(
  'layout_status',
  {
    id: text().primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    isGenerated: integer('is_generated').default(0),
    layoutPath: text('layout_path'),
    totalPages: integer('total_pages'),
    totalPanels: integer('total_panels'),
    generatedAt: text('generated_at'),
    retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('unique_job_episode_layout').on(table.jobId, table.episodeNumber),
    index('idx_layout_status_job_id').on(table.jobId),
  ],
)

export const outputs = sqliteTable(
  'outputs',
  {
    id: text().primaryKey().notNull(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    outputType: text('output_type').notNull(),
    outputPath: text('output_path').notNull(),
    fileSize: integer('file_size'),
    pageCount: integer('page_count'),
    metadataPath: text('metadata_path'),
    createdAt: text('created_at').default('sql`(CURRENT_TIMESTAMP)`'),
    userId: text('user_id').default('').notNull(),
  },
  (table) => [
    index('idx_outputs_job_id').on(table.jobId),
    index('idx_outputs_novel_id').on(table.novelId),
  ],
)

export const renderStatus = sqliteTable(
  'render_status',
  {
    id: text().primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    pageNumber: integer('page_number').notNull(),
    isRendered: integer('is_rendered').default(0),
    imagePath: text('image_path'),
    thumbnailPath: text('thumbnail_path'),
    width: integer(),
    height: integer(),
    fileSize: integer('file_size'),
    renderedAt: text('rendered_at'),
    retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex('unique_job_episode_page').on(table.jobId, table.episodeNumber, table.pageNumber),
    index('idx_render_status_job_id').on(table.jobId),
  ],
)

export const tokenUsage = sqliteTable(
  'token_usage',
  {
    id: text().primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    cost: real(),
    stepName: text('step_name'),
    chunkIndex: integer('chunk_index'),
    episodeNumber: integer('episode_number'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_token_usage_created_at').on(table.createdAt),
    index('idx_token_usage_provider').on(table.provider),
    index('idx_token_usage_agent_name').on(table.agentName),
    index('idx_token_usage_job_id').on(table.jobId),
  ],
)

export const account = sqliteTable(
  'account',
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text(),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providerAccountId],
      name: 'account_provider_providerAccountId_pk',
    }),
  ],
)

export const user = sqliteTable(
  'user',
  {
    id: text().primaryKey().notNull(),
    name: text(),
    email: text(),
    emailVerified: integer(),
    image: text(),
    createdAt: text('created_at').default('sql`(CURRENT_TIMESTAMP)`'),
    emailNotifications: integer('email_notifications').default(1),
    theme: text().default('light'),
    language: text().default('ja'),
  },
  (table) => [uniqueIndex('user_email_unique').on(table.email)],
)

export const verificationToken = sqliteTable(
  'verificationToken',
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: integer().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.identifier, table.token],
      name: 'verificationToken_identifier_token_pk',
    }),
  ],
)

export const novels = sqliteTable(
  'novels',
  {
    id: text().primaryKey().notNull(),
    title: text(),
    author: text(),
    originalTextPath: text('original_text_path'),
    textLength: integer('text_length').notNull(),
    language: text().default('ja'),
    metadataPath: text('metadata_path'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_novels_created_at').on(table.createdAt),
    index('idx_novels_user_id').on(table.userId),
  ],
)

export const session = sqliteTable('session', {
  sessionToken: text().primaryKey().notNull(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: integer().notNull(),
})

export const jobs = sqliteTable(
  'jobs',
  {
    id: text().primaryKey().notNull(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobName: text('job_name'),
    userId: text('user_id')
      .default('anonymous')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text().default('pending').notNull(),
    currentStep: text('current_step').default('initialized').notNull(),
    splitCompleted: integer('split_completed').default(0),
    analyzeCompleted: integer('analyze_completed').default(0),
    episodeCompleted: integer('episode_completed').default(0),
    layoutCompleted: integer('layout_completed').default(0),
    renderCompleted: integer('render_completed').default(0),
    chunksDirPath: text('chunks_dir_path'),
    analysesDirPath: text('analyses_dir_path'),
    episodesDataPath: text('episodes_data_path'),
    layoutsDirPath: text('layouts_dir_path'),
    rendersDirPath: text('renders_dir_path'),
    characterMemoryPath: text('character_memory_path'),
    promptMemoryPath: text('prompt_memory_path'),
    totalChunks: integer('total_chunks').default(0),
    processedChunks: integer('processed_chunks').default(0),
    totalEpisodes: integer('total_episodes').default(0),
    processedEpisodes: integer('processed_episodes').default(0),
    totalPages: integer('total_pages').default(0),
    renderedPages: integer('rendered_pages').default(0),
    processingEpisode: integer('processing_episode'),
    processingPage: integer('processing_page'),
    lastError: text('last_error'),
    lastErrorStep: text('last_error_step'),
    retryCount: integer('retry_count').default(0),
    resumeDataPath: text('resume_data_path'),
    coverageWarnings: text('coverage_warnings'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default('sql`(CURRENT_TIMESTAMP)`'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => [
    index('idx_jobs_user_id').on(table.userId),
    index('idx_jobs_current_step').on(table.currentStep),
    index('idx_jobs_novel_id_status').on(table.novelId, table.status),
    index('idx_jobs_status').on(table.status),
    index('idx_jobs_novel_id').on(table.novelId),
  ],
)

export const storageFiles = sqliteTable(
  'storage_files',
  {
    id: text().primaryKey().notNull(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    fileCategory: text('file_category').notNull(),
    fileType: text('file_type').notNull(),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_storage_files_user_id').on(table.userId),
    index('idx_storage_files_novel_id').on(table.novelId),
    uniqueIndex('storage_files_file_path_unique').on(table.filePath),
  ],
)

export const characterRegistry = sqliteTable(
  'character_registry',
  {
    id: text().primaryKey().notNull(),
    canonicalName: text('canonical_name').notNull(),
    aliases: text(),
    summary: text(),
    voiceStyle: text('voice_style'),
    relationships: text(),
    firstChunk: integer('first_chunk').notNull(),
    lastSeenChunk: integer('last_seen_chunk').notNull(),
    confidenceScore: real('confidence_score').default(1),
    status: text().default('active'),
    metadata: text(),
    createdAt: text('created_at').default('sql`(CURRENT_TIMESTAMP)`'),
    updatedAt: text('updated_at').default('sql`(CURRENT_TIMESTAMP)`'),
  },
  (table) => [
    index('idx_char_last_seen').on(table.lastSeenChunk),
    index('idx_char_confidence').on(table.confidenceScore),
    index('idx_char_status').on(table.status),
  ],
)

export const sceneRegistry = sqliteTable(
  'scene_registry',
  {
    id: text().primaryKey().notNull(),
    location: text().notNull(),
    timeContext: text('time_context'),
    summary: text(),
    anchorText: text('anchor_text'),
    chunkRange: text('chunk_range'),
    metadata: text(),
    createdAt: text('created_at').default('sql`(CURRENT_TIMESTAMP)`'),
    updatedAt: text('updated_at').default('sql`(CURRENT_TIMESTAMP)`'),
  },
  (table) => [
    index('idx_scene_range').on(table.chunkRange),
    index('idx_scene_location').on(table.location),
  ],
)

export const chunkState = sqliteTable(
  'chunk_state',
  {
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    maskedText: text('masked_text'),
    extraction: text(),
    confidence: real(),
    tierUsed: integer('tier_used'),
    tokensUsed: integer('tokens_used'),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: text('created_at').default('sql`(CURRENT_TIMESTAMP)`'),
  },
  (table) => [
    primaryKey({
      columns: [table.jobId, table.chunkIndex],
      name: 'chunk_state_job_id_chunk_index_pk',
    }),
    index('idx_chunk_job').on(table.jobId),
    index('idx_chunk_confidence').on(table.confidence),
    index('idx_chunk_tier').on(table.tierUsed),
  ],
)

export const aliasFts = sqliteTable('alias_fts', {
  charId: text('char_id'),
  aliasText: text('alias_text'),
  contextWords: text('context_words'),
})

export const authenticators = sqliteTable(
  'authenticators',
  {
    credentialId: text('credential_id').notNull(),
    userId: text('user_id')
      .default('anonymous')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerAccountId: text('provider_account_id').notNull(),
    credentialPublicKey: text('credential_public_key').notNull(),
    counter: integer().notNull(),
    credentialDeviceType: text('credential_device_type').notNull(),
    credentialBackedUp: integer('credential_backed_up').notNull(),
    transports: text(),
  },
  (table) => [
    uniqueIndex('authenticators_credential_id_unique').on(table.credentialId),
    primaryKey({
      columns: [table.credentialId, table.userId],
      name: 'authenticators_credential_id_user_id_pk',
    }),
  ],
)
