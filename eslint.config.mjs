import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'node_modules/**', 'next-env.d.ts']),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['components/auth/auth-screen.tsx', 'components/workspace/workspace-app.tsx'],
    rules: {
      // Existing v0 client screens hydrate from localStorage in effects; keep that behavior.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
