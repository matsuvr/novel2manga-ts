import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'

export const mastra = new Mastra({
  // workflows: {}, // weatherワークフローを削除
  // agents: {}, // weatherエージェントを削除
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ':memory:',
  }),
  // PinoLoggerとOpenTelemetry依存関係を削除
})
