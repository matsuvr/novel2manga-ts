# Token Usage Optimization Plan

## Objective

Reduce exponential token growth by implementing strategies **Front/Back Compression** (3) and **Chunk Step Merging** (4). Target: transform token cost into an approximately linear function of novel length.

## Scope

- Existing pipeline for novel analysis and script generation.
- Only documentation and planning; no code changes in this commit.

## Strategy 3: Front/Back Compression

1. Replace full preceding and succeeding chunk inclusion with compact summaries.
2. Store a rolling window of ~2 summaries (previous and next) of ~150 characters each.
3. Summaries generated once per chunk; cached for reuse.
4. Update prompts to include summaries instead of raw text.
5. Provide utility to regenerate summaries when upstream text changes.

### Risks

- Loss of context may reduce character consistency.
- Summaries must remain under strict size limit; require automated enforcement.

### Metrics

- Token usage per chunk remains roughly constant.
- Generated script retains key cross-chunk references.

## Strategy 4: Chunk Step Merging

1. Combine analysis and conversion steps into a single LLM call per chunk.
2. Use structured output schema to emit both analysis results and script lines in one response.
3. Decompose existing multi-step workflow and remove intermediate prompts.
4. Add error handling: if response invalid, retry once with explicit correction instructions.

### Risks

- Larger prompts may hit model limits; requires monitoring.
- Single-step failure causes larger rollback; implement idempotent writes.

### Metrics

- Number of LLM calls per chunk reduced from 2+ to 1.
- Token usage halves while preserving output accuracy.

## Milestones

1. Design structured summary format and caching mechanism.
2. Define unified prompt & schema for merged step.
3. Implement, integrate, and benchmark token cost vs. baseline.
