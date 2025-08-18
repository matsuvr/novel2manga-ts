export default {
  // TypeScript/JavaScript files
  '**/*.{ts,tsx,js,jsx}': [
    // 1. Format with Prettier first
    'prettier --write',
    // 2. Apply Biome linting fixes (including unsafe ones)
    'biome lint --write --unsafe --no-errors-on-unmatched',
    // 3. Format with Biome to ensure consistency
    'biome format --write --no-errors-on-unmatched',
  ],

  // JSON and other config files
  '**/*.{json,jsonc}': ['prettier --write'],

  // Markdown and YAML files
  '**/*.{md,yml,yaml}': ['prettier --write'],

  // Package.json specific handling
  'package.json': [
    'prettier --write',
    // Sort package.json
    'npm pkg fix',
  ],
}
