import { relations } from 'drizzle-orm/relations'
import {
  account,
  authenticators,
  chunkAnalysisStatus,
  chunkState,
  chunks,
  episodes,
  jobStepHistory,
  jobs,
  layoutStatus,
  novels,
  outputs,
  renderStatus,
  session,
  storageFiles,
  tokenUsage,
  user,
} from './schema'

export const chunkAnalysisStatusRelations = relations(chunkAnalysisStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [chunkAnalysisStatus.jobId],
    references: [jobs.id],
  }),
}))

export const chunkStateRelations = relations(chunkState, ({ one }) => ({
  job: one(jobs, {
    fields: [chunkState.jobId],
    references: [jobs.id],
  }),
}))

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  chunkAnalysisStatuses: many(chunkAnalysisStatus),
  chunks: many(chunks),
  chunkStates: many(chunkState),
  episodes: many(episodes),
  jobStepHistories: many(jobStepHistory),
  layoutStatuses: many(layoutStatus),
  outputs: many(outputs),
  renderStatuses: many(renderStatus),
  tokenUsages: many(tokenUsage),
  user: one(user, {
    fields: [jobs.userId],
    references: [user.id],
  }),
  novel: one(novels, {
    fields: [jobs.novelId],
    references: [novels.id],
  }),
  storageFiles: many(storageFiles),
}))

export const chunksRelations = relations(chunks, ({ one }) => ({
  job: one(jobs, {
    fields: [chunks.jobId],
    references: [jobs.id],
  }),
  novel: one(novels, {
    fields: [chunks.novelId],
    references: [novels.id],
  }),
}))

export const novelsRelations = relations(novels, ({ one, many }) => ({
  chunks: many(chunks),
  episodes: many(episodes),
  outputs: many(outputs),
  user: one(user, {
    fields: [novels.userId],
    references: [user.id],
  }),
  jobs: many(jobs),
  storageFiles: many(storageFiles),
}))

export const episodesRelations = relations(episodes, ({ one }) => ({
  job: one(jobs, {
    fields: [episodes.jobId],
    references: [jobs.id],
  }),
  novel: one(novels, {
    fields: [episodes.novelId],
    references: [novels.id],
  }),
}))

export const jobStepHistoryRelations = relations(jobStepHistory, ({ one }) => ({
  job: one(jobs, {
    fields: [jobStepHistory.jobId],
    references: [jobs.id],
  }),
}))

export const layoutStatusRelations = relations(layoutStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [layoutStatus.jobId],
    references: [jobs.id],
  }),
}))

export const outputsRelations = relations(outputs, ({ one }) => ({
  job: one(jobs, {
    fields: [outputs.jobId],
    references: [jobs.id],
  }),
  novel: one(novels, {
    fields: [outputs.novelId],
    references: [novels.id],
  }),
}))

export const renderStatusRelations = relations(renderStatus, ({ one }) => ({
  job: one(jobs, {
    fields: [renderStatus.jobId],
    references: [jobs.id],
  }),
}))

export const tokenUsageRelations = relations(tokenUsage, ({ one }) => ({
  job: one(jobs, {
    fields: [tokenUsage.jobId],
    references: [jobs.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  novels: many(novels),
  sessions: many(session),
  jobs: many(jobs),
  storageFiles: many(storageFiles),
  authenticators: many(authenticators),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
  user: one(user, {
    fields: [storageFiles.userId],
    references: [user.id],
  }),
  job: one(jobs, {
    fields: [storageFiles.jobId],
    references: [jobs.id],
  }),
  novel: one(novels, {
    fields: [storageFiles.novelId],
    references: [novels.id],
  }),
}))

export const authenticatorsRelations = relations(authenticators, ({ one }) => ({
  user: one(user, {
    fields: [authenticators.userId],
    references: [user.id],
  }),
}))
