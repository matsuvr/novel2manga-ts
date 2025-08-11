Project moved under GitHub Project org

- New repository URL: https://github.com/matsuvrprojects/novel2manga-mastra

If your local "origin" still points to the old URL, update it:

```
git remote set-url origin https://github.com/matsuvrprojects/novel2manga-mastra.git
git remote -v
```

Contribution workflow

- Create a topic branch from main
- Commit with auto-fix on pre-commit (lint-staged + Biome/Prettier)
- Push and open a PR (CI runs checks and tests)

Notes

- Local pre-push hooks are not used; CI gates the merge.
- JSON/JSONC are formatted by Prettier; biome.json is formatted by Biome.
