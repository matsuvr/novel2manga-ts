Golden image fixtures for new rendering pipeline.

Process:
1. Generate layout fixture deterministically.
2. Render page(s) via NewRenderingOrchestrator or lower-level page renderer.
3. Compare PNG buffer to stored golden using pixelmatch with small threshold.
4. If fallback placeholder buffer detected (string prefix 'PNG_PLACEHOLDER_PAGE_'), skip with warning.

Update policy:
- Only update golden images intentionally (run with UPDATE_GOLDEN=1 env var – future enhancement).
- Keep number of golden pages minimal (1-2) per feature to limit churn.
