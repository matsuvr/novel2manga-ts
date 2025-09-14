# Tasks: Migrate `canvas` → `@napi-rs/canvas`

- [x] T1 Add dependency `@napi-rs/canvas` and remove `canvas`
- [x] T2 Swap imports in core renderer
- [x] T3 Replace Image constructor usage with `loadImage`
- [ ] T4 Fonts API via `GlobalFonts.registerFromPath`
- [ ] T5 Optional encode path
- [x] T6 Update tests to mock `@napi-rs/canvas`
- [ ] T7 Golden-image tests
- [ ] T8 Pixel diff harness
- [x] T9 CI optimization: run on `ubuntu-22.04` and skip native builds with `npm ci --ignore-scripts`
- [ ] T10 Runtime check for Workers
- [ ] T11 Feature flag & rollback
- [ ] T12 Benchmark script
- [x] Fix loadImage type assignment to match `@napi-rs/canvas`
