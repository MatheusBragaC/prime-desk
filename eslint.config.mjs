// Catraca de lint. Não é faxina: cada regra `error` aqui corresponde a um
// defeito que já aconteceu neste repositório (ver docs/auditoria/README.md).
// O preset é deliberadamente pequeno — regra que suja o código atual entra
// como `warn` e a dívida fica contada em docs/auditoria/README.md.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'scripts/**', '*.cjs']
  },

  // Base para todo TS/TSX do app.
  {
    files: ['src/**/*.{ts,tsx}', 'electron.vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser }
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        node: { extensions: ['.ts', '.tsx', '.js', '.jsx'] }
      }
    },
    rules: {
      // Zero hoje no repo (auditoria de tipagem). A regra existe para preservar isso.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10
        }
      ],
      // Ruído que não é defeito; o typecheck já cobre o que importa.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Byte de controle em regex. O NUL em literal de string é do scripts/checkui.cjs.
      'no-control-regex': 'error',
      'no-irregular-whitespace': ['error', { skipStrings: false, skipTemplates: false }]
    }
  },

  // Main: o único `any` do processo principal é a assinatura genérica de
  // handler do `ipcMain.handle` (src/main/index.ts:83). Fica `warn` para não
  // exigir reescrita do dispatcher.
  {
    files: ['src/main/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' }
  },

  // Fronteira IPC: causa-raiz dos ~25/54 casts. Aqui `any` é erro duro.
  {
    files: ['src/preload/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }
      ]
    }
  },

  // Renderer: React + direção das camadas.
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      // Dívida conhecida: a base atual tem avisos legítimos aqui. Fica `warn`
      // para não exigir reescrita em massa; contagem em docs/auditoria/README.md.
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // O renderer fala com o main por `src/shared` + preload (`window.prime`).
      // Importar `src/main` arrastaria código de Node para dentro do bundle.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/main/*', '**/main/**', '**/src/main/**', '@main/*', '@main/**'],
              message: 'renderer não importa de src/main — use src/shared (@shared) ou o preload'
            }
          ]
        }
      ]
    }
  },

  // Inversão de camada desfeita em 7a4bb32: `lib/` é a camada de baixo.
  {
    files: ['src/renderer/src/lib/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          basePath: '.',
          zones: [
            {
              target: './src/renderer/src/lib',
              from: './src/renderer/src/components',
              message:
                'lib/ não importa de components/ (inversão de camada) — mova o tipo para lib/types.ts'
            }
          ]
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/*', '**/components/**', '@/components/*', '@/components/**'],
              message:
                'lib/ não importa de components/ (inversão de camada) — mova o tipo para lib/types.ts'
            },
            {
              group: ['**/main/*', '**/src/main/**'],
              message: 'renderer não importa de src/main — use src/shared (@shared) ou o preload'
            }
          ]
        }
      ]
    }
  }
)
