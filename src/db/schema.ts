import crypto from 'node:crypto'
import { relations, sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'

// 認証テーブル群

export const accounts = sqliteTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),

    providerAccountId: text('providerAccountId').notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: text('token_type'),
    scope: text('scope'),
    idToken: text('id_token'),
    sessionState: text('session_state'),
  },
  (account) => ({
    compositePk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
)

export const sessions = sqliteTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
})

export const verificationTokens = sqliteTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
)

// WebAuthn などの認証情報
export const authenticators = sqliteTable(
  'authenticators',
  {
    credentialId: text('credential_id').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .default('anonymous')
      .references(() => users.id, { onDelete: 'cascade' }),
    providerAccountId: text('provider_account_id').notNull(),
    credentialPublicKey: text('credential_public_key').notNull(),
    counter: integer('counter').notNull(),
    credentialDeviceType: text('credential_device_type').notNull(),
    credentialBackedUp: integer('credential_backed_up', { mode: 'boolean' }).notNull(),
    transports: text('transports'),
  },
  (authenticator) => ({
    pk: primaryKey({ columns: [authenticator.userId, authenticator.credentialId] }),
  }),
)

// ユーザーテーブルを拡張（NextAuthのusersテーブルを使用）
export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

// 小説テーブル（最上位エンティティ）
export const novels = sqliteTable(
  'novels',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    author: text('author'),
    originalTextPath: text('original_text_path'),
    textLength: integer('text_length').notNull(),
    language: text('language').default('ja'),
    metadataPath: text('metadata_path'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdIdx: index('idx_novels_user_id').on(table.userId),
    createdAtIdx: index('idx_novels_created_at').on(table.createdAt),
  }),
)

// 変換ジョブテーブル（小説に対する変換処理）
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobName: text('job_name'),
    userId: text('user_id').notNull().default('anonymous'),

    // ステータス管理
    status: text('status').notNull().default('pending'), // pending/processing/completed/failed/paused
    currentStep: text('current_step').notNull().default('initialized'), // initialized/split/analyze/episode/layout/render/complete

    // 各ステップの完了状態
    splitCompleted: integer('split_completed', { mode: 'boolean' }).default(false),
    analyzeCompleted: integer('analyze_completed', { mode: 'boolean' }).default(false),
    episodeCompleted: integer('episode_completed', { mode: 'boolean' }).default(false),
    layoutCompleted: integer('layout_completed', { mode: 'boolean' }).default(false),
    renderCompleted: integer('render_completed', { mode: 'boolean' }).default(false),

    // 各ステップの成果物パス（ディレクトリ）
    chunksDirPath: text('chunks_dir_path'),
    analysesDirPath: text('analyses_dir_path'),
    episodesDataPath: text('episodes_data_path'),
    layoutsDirPath: text('layouts_dir_path'),
    rendersDirPath: text('renders_dir_path'),

    // 進捗詳細
    totalChunks: integer('total_chunks').default(0),
    processedChunks: integer('processed_chunks').default(0),
    totalEpisodes: integer('total_episodes').default(0),
    processedEpisodes: integer('processed_episodes').default(0),
    totalPages: integer('total_pages').default(0),
    renderedPages: integer('rendered_pages').default(0),

    // 実行中の位置（UX向上用の現在位置）
    processingEpisode: integer('processing_episode'),
    processingPage: integer('processing_page'),

    // エラー管理
    lastError: text('last_error'),
    lastErrorStep: text('last_error_step'),
    retryCount: integer('retry_count').default(0),

    // 再開用の状態保存
    resumeDataPath: text('resume_data_path'),

    // カバレッジ警告 (JSON)
    coverageWarnings: text('coverage_warnings'),

    // タイムスタンプ
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => ({
    novelIdIdx: index('idx_jobs_novel_id').on(table.novelId),
    statusIdx: index('idx_jobs_status').on(table.status),
    novelIdStatusIdx: index('idx_jobs_novel_id_status').on(table.novelId, table.status),
    currentStepIdx: index('idx_jobs_current_step').on(table.currentStep),
    userIdIdx: index('idx_jobs_user_id').on(table.userId),
  }),
)

// ジョブステップ履歴テーブル（各ステップの実行記録）
export const jobStepHistory = sqliteTable(
  'job_step_history',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    stepName: text('step_name').notNull(), // split/analyze/episode/layout/render
    status: text('status').notNull(), // started/completed/failed/skipped
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    durationSeconds: integer('duration_seconds'),
    inputPath: text('input_path'),
    outputPath: text('output_path'),
    errorMessage: text('error_message'),
    metadata: text('metadata'), // JSON形式の追加情報
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('idx_job_step_history_job_id').on(table.jobId),
  }),
)

// チャンクテーブル（分割されたテキスト）
export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
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
  (table) => ({
    novelIdIdx: index('idx_chunks_novel_id').on(table.novelId),
    jobIdIdx: index('idx_chunks_job_id').on(table.jobId),
    uniqueJobChunk: index('unique_job_chunk').on(table.jobId, table.chunkIndex),
  }),
)

// チャンク分析状態テーブル（各チャンクの分析完了状態）
export const chunkAnalysisStatus = sqliteTable(
  'chunk_analysis_status',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    isAnalyzed: integer('is_analyzed', { mode: 'boolean' }).default(false),
    analysisPath: text('analysis_path'),
    analyzedAt: text('analyzed_at'),
    retryCount: integer('retry_count').default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('idx_chunk_analysis_status_job_id').on(table.jobId),
    uniqueJobChunk: index('unique_job_chunk_analysis').on(table.jobId, table.chunkIndex),
  }),
)

// エピソードテーブル
export const episodes = sqliteTable(
  'episodes',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    title: text('title'),
    summary: text('summary'),
    startChunk: integer('start_chunk').notNull(),
    startCharIndex: integer('start_char_index').notNull(),
    endChunk: integer('end_chunk').notNull(),
    endCharIndex: integer('end_char_index').notNull(),
    confidence: real('confidence').notNull(),
    episodeTextPath: text('episode_text_path'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    novelIdIdx: index('idx_episodes_novel_id').on(table.novelId),
    jobIdIdx: index('idx_episodes_job_id').on(table.jobId),
    uniqueJobEpisode: unique('unique_job_episode').on(table.jobId, table.episodeNumber),
  }),
)

// レイアウト状態テーブル（各エピソードのレイアウト生成状態）
export const layoutStatus = sqliteTable(
  'layout_status',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    isGenerated: integer('is_generated', { mode: 'boolean' }).default(false),
    layoutPath: text('layout_path'),
    totalPages: integer('total_pages'),
    totalPanels: integer('total_panels'),
    generatedAt: text('generated_at'),
    retryCount: integer('retry_count').default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('idx_layout_status_job_id').on(table.jobId),
    uniqueJobEpisode: unique('unique_job_episode_layout').on(table.jobId, table.episodeNumber),
  }),
)

// 描画状態テーブル（各ページの描画状態）
export const renderStatus = sqliteTable(
  'render_status',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    episodeNumber: integer('episode_number').notNull(),
    pageNumber: integer('page_number').notNull(),
    isRendered: integer('is_rendered', { mode: 'boolean' }).default(false),
    imagePath: text('image_path'),
    thumbnailPath: text('thumbnail_path'),
    width: integer('width'),
    height: integer('height'),
    fileSize: integer('file_size'),
    renderedAt: text('rendered_at'),
    retryCount: integer('retry_count').default(0),
    lastError: text('last_error'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('idx_render_status_job_id').on(table.jobId),
    uniqueJobEpisodePage: unique('unique_job_episode_page').on(
      table.jobId,
      table.episodeNumber,
      table.pageNumber,
    ),
  }),
)

// 最終成果物テーブル
export const outputs = sqliteTable(
  'outputs',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    outputType: text('output_type').notNull(), // pdf/cbz/images_zip/epub
    outputPath: text('output_path').notNull(),
    fileSize: integer('file_size'),
    pageCount: integer('page_count'),
    metadataPath: text('metadata_path'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    novelIdIdx: index('idx_outputs_novel_id').on(table.novelId),
    jobIdIdx: index('idx_outputs_job_id').on(table.jobId),
  }),
)

// ストレージ参照テーブル（全ファイルの追跡）
export const storageFiles = sqliteTable(
  'storage_files',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobId: text('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull().unique(),
    fileCategory: text('file_category').notNull(), // original/chunk/analysis/episode/layout/render/output/metadata
    fileType: text('file_type').notNull(), // txt/json/yaml/png/jpg/pdf/zip
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    novelIdIdx: index('idx_storage_files_novel_id').on(table.novelId),
  }),
)

// トークン使用量テーブル（LLM API使用量の追跡）
export const tokenUsage = sqliteTable(
  'token_usage',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(), // chunk-analyzer, layout-generator, etc.
    provider: text('provider').notNull(), // cerebras, openai, gemini, etc.
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    cost: real('cost'), // 概算コスト（USD）
    stepName: text('step_name'), // analyze, layout, etc.
    chunkIndex: integer('chunk_index'), // チャンク分析の場合
    episodeNumber: integer('episode_number'), // エピソード処理の場合
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    jobIdIdx: index('idx_token_usage_job_id').on(table.jobId),
    agentNameIdx: index('idx_token_usage_agent_name').on(table.agentName),
    providerIdx: index('idx_token_usage_provider').on(table.provider),
    createdAtIdx: index('idx_token_usage_created_at').on(table.createdAt),
  }),
)

// リレーション定義
export const novelsRelations = relations(novels, ({ many, one }) => ({
  jobs: many(jobs),
  chunks: many(chunks),
  episodes: many(episodes),
  outputs: many(outputs),
  storageFiles: many(storageFiles),
  user: one(users, {
    fields: [novels.userId],
    references: [users.id],
  }),
}))

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  novel: one(novels, {
    fields: [jobs.novelId],
    references: [novels.id],
  }),
  user: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
  stepHistory: many(jobStepHistory),
  chunks: many(chunks),
  episodes: many(episodes),
  layoutStatus: many(layoutStatus),
  renderStatus: many(renderStatus),
  outputs: many(outputs),
  storageFiles: many(storageFiles),
  tokenUsage: many(tokenUsage),
}))

export const jobStepHistoryRelations = relations(jobStepHistory, ({ one }) => ({
  job: one(jobs, {
    fields: [jobStepHistory.jobId],
    references: [jobs.id],
  }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  authenticators: many(authenticators),
  novels: many(novels),
  jobs: many(jobs),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const authenticatorsRelations = relations(authenticators, ({ one }) => ({
  user: one(users, {
    fields: [authenticators.userId],
    references: [users.id],
  }),
}))

export const chunksRelations = relations(chunks, ({ one }) => ({
  novel: one(novels, {
    fields: [chunks.novelId],
    references: [novels.id],
  }),
  job: one(jobs, {
    fields: [chunks.jobId],
    references: [jobs.id],
  }),
}))

export const chunkAnalysisStatusRelations = relations(chunkAnalysisStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [chunkAnalysisStatus.jobId],
    references: [jobs.id],
  }),
}))

export const episodesRelations = relations(episodes, ({ one }) => ({
  novel: one(novels, {
    fields: [episodes.novelId],
    references: [novels.id],
  }),
  job: one(jobs, {
    fields: [episodes.jobId],
    references: [jobs.id],
  }),
}))

export const layoutStatusRelations = relations(layoutStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [layoutStatus.jobId],
    references: [jobs.id],
  }),
}))

export const renderStatusRelations = relations(renderStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [renderStatus.jobId],
    references: [jobs.id],
  }),
}))

export const outputsRelations = relations(outputs, ({ one }) => ({
  novel: one(novels, {
    fields: [outputs.novelId],
    references: [novels.id],
  }),
  job: one(jobs, {
    fields: [outputs.jobId],
    references: [jobs.id],
  }),
}))

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
  novel: one(novels, {
    fields: [storageFiles.novelId],
    references: [novels.id],
  }),
  job: one(jobs, {
    fields: [storageFiles.jobId],
    references: [jobs.id],
  }),
}))

export const tokenUsageRelations = relations(tokenUsage, ({ one }) => ({
  job: one(jobs, {
    fields: [tokenUsage.jobId],
    references: [jobs.id],
  }),
}))

// 型エクスポート
export type Novel = typeof novels.$inferSelect
export type NewNovel = typeof novels.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type JobStepHistory = typeof jobStepHistory.$inferSelect
export type NewJobStepHistory = typeof jobStepHistory.$inferInsert
export type Chunk = typeof chunks.$inferSelect
export type NewChunk = typeof chunks.$inferInsert
export type ChunkAnalysisStatus = typeof chunkAnalysisStatus.$inferSelect
export type NewChunkAnalysisStatus = typeof chunkAnalysisStatus.$inferInsert
export type Episode = typeof episodes.$inferSelect
export type NewEpisode = typeof episodes.$inferInsert
export type LayoutStatus = typeof layoutStatus.$inferSelect
export type NewLayoutStatus = typeof layoutStatus.$inferInsert
export type RenderStatus = typeof renderStatus.$inferSelect
export type NewRenderStatus = typeof renderStatus.$inferInsert
export type Output = typeof outputs.$inferSelect
export type NewOutput = typeof outputs.$inferInsert
export type StorageFile = typeof storageFiles.$inferSelect
export type NewStorageFile = typeof storageFiles.$inferInsert
export type TokenUsage = typeof tokenUsage.$inferSelect
export type NewTokenUsage = typeof tokenUsage.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert
export type Authenticator = typeof authenticators.$inferSelect
export type NewAuthenticator = typeof authenticators.$inferInsert
