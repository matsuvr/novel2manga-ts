# Token Usage Optimization Tasks

## Preparation

- [x] Define summary data structure and size limits.
- [x] Create cache storage for chunk summaries.
- [ ] Draft unified prompt schema for merged step.

## Implementation

- [x] Implement summary generation utility.
- [x] Integrate summary caching into chunk pipeline.
- [x] Replace raw text inclusion with summary references.
- [ ] Merge analysis and conversion into single LLM call.
- [ ] Validate structured response and handle retries.

## Verification

- [ ] Benchmark token usage against baseline with 10k and 100k char novels.
- [ ] Ensure script quality and character consistency remain acceptable.
- [ ] Update documentation and configs after implementation.
