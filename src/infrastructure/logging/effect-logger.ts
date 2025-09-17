/**
 * Effect Logger Layer
 *
 * 目的:
 *  - 既存 getLogger() (AsyncLocalStorage ベース) を Effect の Fiber ローカル文脈へブリッジ
 *  - Effect コンポーザブルな API (Effect.log* ではなく独自 Tag) を提供
 *  - build phase では既存 logger 同様 no-op
 *  - 追加依存や副作用 (ファイル生成等) を import 時に発生させない
 *
 * 提供物:
 *  - LoggerEffectService Tag
 *  - LoggerEffectLayer (live 実装 Layer)
 *  - withEffectLogContext / effectLoggerContext: Effect 内での contextual metadata 付与
 *  - helper: logDebug/info/warn/error (structured message + meta)
 */

import { Context, Effect, FiberRef, Layer, pipe } from 'effect'
import { getLogger, type LoggerPort, runWithLogContext } from '@/infrastructure/logging/logger'

// Contextual metadata を FiberRef で保持 (shallow merge)
const LogMetaRef = FiberRef.unsafeMake<Readonly<Record<string, unknown>>>({})

export interface LoggerEffectService {
  readonly logger: LoggerPort
  readonly getMeta: () => Effect.Effect<Readonly<Record<string, unknown>>>
  readonly withMeta: (meta: Record<string, unknown>) => <R, E, A>(
    eff: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>
  readonly logDebug: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>
  readonly logInfo: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>
  readonly logWarn: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>
  readonly logError: (msg: string, meta?: Record<string, unknown>) => Effect.Effect<void>
}

export const LoggerEffectService = Context.GenericTag<LoggerEffectService>('LoggerEffectService')

function mergeMeta(base: Record<string, unknown>, patch?: Record<string, unknown>) {
  if (!patch || Object.keys(patch).length === 0) return base
  return { ...base, ...patch }
}

const makeService = (logger: LoggerPort): LoggerEffectService => ({
  logger,
  getMeta: () => FiberRef.get(LogMetaRef),
  withMeta: (meta) => (eff) =>
    Effect.flatMap(FiberRef.get(LogMetaRef), (prev) =>
      Effect.locally(LogMetaRef, mergeMeta(prev as Record<string, unknown>, meta))(eff),
    ),
  logDebug: (msg, meta) =>
    Effect.flatMap(FiberRef.get(LogMetaRef), (ctx) =>
      Effect.sync(() => logger.debug(msg, mergeMeta(ctx as Record<string, unknown>, meta))),
    ),
  logInfo: (msg, meta) =>
    Effect.flatMap(FiberRef.get(LogMetaRef), (ctx) =>
      Effect.sync(() => logger.info(msg, mergeMeta(ctx as Record<string, unknown>, meta))),
    ),
  logWarn: (msg, meta) =>
    Effect.flatMap(FiberRef.get(LogMetaRef), (ctx) =>
      Effect.sync(() => logger.warn(msg, mergeMeta(ctx as Record<string, unknown>, meta))),
    ),
  logError: (msg, meta) =>
    Effect.flatMap(FiberRef.get(LogMetaRef), (ctx) =>
      Effect.sync(() => logger.error(msg, mergeMeta(ctx as Record<string, unknown>, meta))),
    ),
})

// Layer: getLogger() は遅延初期化; build phase では NoopLogger を返すので安全
export const LoggerEffectLayer = Layer.effect(LoggerEffectService, Effect.sync(() => makeService(getLogger())))

// Helper: Effect 内でメタ付与 (例: withEffectLogContext({ requestId }) ( ... ))
export const withEffectLogContext = (meta: Record<string, unknown>) => <R, E, A>(
  eff: Effect.Effect<A, E, R>,
) => Effect.flatMap(LoggerEffectService, (svc) => svc.withMeta(meta)(eff))

// 外部 (Promise/非 Effect コード) から Effect 実行しつつ AsyncLocalStorage コンテキストを同期
// runWithLogContext を一層で包み、FiberRef 初期 context も適用
export function runEffectWithLogContext<A, E, R>(meta: Record<string, unknown>, eff: Effect.Effect<A, E, R>): Promise<A> {
  // R から LoggerEffectService を除去した残り環境を never に絞るには先に Layer 供給を確定させる必要があるため
  // provideSomeLayer → provide → runPromise の順で適用
  const provided = pipe(
    eff,
    withEffectLogContext(meta),
    Effect.provide(LoggerEffectLayer),
  ) as Effect.Effect<A, E, never>
  return runWithLogContext(meta, () => Effect.runPromise(provided))
}

// 低ボイラープレート logger 関数群
export const logDebug = (msg: string, meta?: Record<string, unknown>) =>
  Effect.flatMap(LoggerEffectService, (svc) => svc.logDebug(msg, meta))
export const logInfo = (msg: string, meta?: Record<string, unknown>) =>
  Effect.flatMap(LoggerEffectService, (svc) => svc.logInfo(msg, meta))
export const logWarn = (msg: string, meta?: Record<string, unknown>) =>
  Effect.flatMap(LoggerEffectService, (svc) => svc.logWarn(msg, meta))
export const logError = (msg: string, meta?: Record<string, unknown>) =>
  Effect.flatMap(LoggerEffectService, (svc) => svc.logError(msg, meta))

// サンプル使用例 (コメント):
// pipe(
//   Effect.sync(() => 'work'),
//   withEffectLogContext({ requestId: 'r1', userId: 'u1' }),
//   Effect.tap(() => logInfo('work_started')),
//   Effect.tap(() => logDebug('work_progress', { step: 1 })),
//   Effect.scoped,
//   Effect.provide(LoggerEffectLayer),
//   Effect.runPromise,
// )

// NOTE: まだ既存コードには未使用。段階的に UserService 等へ適用予定。

export type { LoggerPort } from '@/infrastructure/logging/logger'
