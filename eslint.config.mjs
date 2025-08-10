import next from 'eslint-config-next'

export default [
  {
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**/*',
      'vitest.config.ts',
      'workers/**/*',
      'tmp_test/**/*',
      '.next/**/*',
      'node_modules',
      'out',
      'dist',
      'build',
      '.open-next',
      '.opennext-cache',
      '.next/cache',
      '.next/server',
      '.next/static',
      '.next/trace',
      'logs',
      '*.log',
      '.env*',
      '.DS_Store',
      'Thumbs.db',
      '.vscode',
      '.idea',
      '.wrangler',
      '.miniflare',
      '*.db',
      '*.sqlite',
      '*.sqlite3',
      'coverage',
      '.nyc_output',
      '*.tsbuildinfo',
      '.mastra',
    ],
  },
  ...next,
  {
    files: ['**/*.{js,jsx,ts,tsx,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/utils/api-error-response',
              message:
                "Deprecated: Use createErrorResponse and ApiError from '@/utils/api-error' instead.",
            },
            {
              name: 'src/utils/api-error-response',
              message:
                "Deprecated: Use createErrorResponse and ApiError from '@/utils/api-error' instead.",
            },
            {
              name: './src/utils/api-error-response',
              message:
                "Deprecated: Use createErrorResponse and ApiError from '@/utils/api-error' instead.",
            },
            {
              name: 'src\\utils\\api-error-response',
              message:
                "Deprecated: Use createErrorResponse and ApiError from '@/utils/api-error' instead.",
            },
          ],
        },
      ],
    },
  },
  // Disallow new HttpError usage in API routes (use ApiError hierarchy instead)
  {
    files: ['src/app/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/utils/http-errors',
                'src/utils/http-errors',
                './src/utils/http-errors',
                '**/utils/http-errors',
              ],
              message:
                'Use ApiError and createErrorResponse (src/utils/api-error) instead of HttpError in routes.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='HttpError']",
          message:
            'Do not instantiate HttpError in routes. Throw ApiError or a subclass (e.g., ValidationError, NotFoundError).',
        },
        {
          selector: "InstanceofExpression[right.name='HttpError']",
          message:
            'Do not type-check against HttpError in routes. Use ApiError (or rely on createErrorResponse).',
        },
        {
          selector: "ClassDeclaration[superClass.name='HttpError']",
          message:
            'Do not declare HttpError subclasses in routes. Define domain-specific ApiError subclasses in shared utils if needed.',
        },
      ],
    },
  },
]
