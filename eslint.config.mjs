import next from 'eslint-config-next'

export default [
  {
    ignores: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/__tests__/**/*',
      'vitest.setup.ts',
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
      '*.db',
      '*.sqlite',
      '*.sqlite3',
      'coverage',
      '.nyc_output',
      '*.tsbuildinfo',
      '.mastra',
      // Previously generated Cloudflare/Miniflare types removed
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
          // API routes should not use the legacy HttpError
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
            // API route direct DB reference is forbidden (type-only imports allowed)
            {
              group: ['@/db', 'src/db', '@/db/index'],
              message:
                "API routes must not reference the DB directly. Use the '@/services/database' factory. Use 'import type' for types.",
            },
          ],
          // Explicit path-based bans
          paths: [
            {
              name: '@/db',
              message:
                "API routes must not reference the DB directly. Use the '@/services/database' factory. Use 'import type' for types.",
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
  // Disallow HttpError usage project-wide (except compatibility layer)
  // and forbid direct '@/db' imports outside tests (use services/database factory instead).
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    excludedFiles: [
      'src/utils/api-error.ts',
      'src/utils/http-errors.ts',
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      // Database bootstrap is an exception (initialization calls '@/db')
      'src/services/database/index.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          allowTypeImports: true,
          paths: [
            {
              name: '@/utils/http-errors',
              message: 'HttpError is deprecated. Use ApiError hierarchy instead.',
            },
            {
              name: 'src/utils/http-errors',
              message: 'HttpError is deprecated. Use ApiError hierarchy instead.',
            },
            {
              name: '@/db',
              message:
                "App layer should not reference DB directly. Use '@/services/database' factory. Use 'import type' for types.",
            },
            {
              name: 'src/db',
              message:
                "App layer should not reference DB directly. Use '@/services/database' factory. Use 'import type' for types.",
            },
          ],
          patterns: [
            {
              group: ['**/db/index', './src/db', '@/db', '@/db/*'],
              message:
                "App layer should not reference DB directly. Use '@/services/database' factory. Use 'import type' for types.",
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='HttpError']",
          message: 'HttpError is deprecated. Use ApiError hierarchy instead.',
        },
      ],
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.test.tsx',
      '**/*.spec.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
]
