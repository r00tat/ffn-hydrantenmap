import { defineConfig, globalIgnores } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = defineConfig([
  // Wrap eslint-config-next rules with fixupConfigRules for ESLint 10 compatibility
  // (eslint-plugin-react still uses removed context methods like context.getFilename())
  ...fixupConfigRules(nextVitals),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.worktrees/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Root JS/MJS config files use eslint-config-next's bundled Babel parser whose
    // scope manager lacks addGlobals() required by ESLint 10. Ignore until upstream fix.
    'next.config.js',
    'eslint.config.mjs',
    '.skills/**',
    '.agents/**',
    // Chrome extension build artifact — bundled minified JS should not be linted.
    'chrome-extension/dist/**',
    // WXT-generated files are recreated on every build.
    'chrome-extension/.wxt/**',
    'chrome-extension/.output/**',
    // Generated Android/Capacitor build artifacts (native-bridge.js etc.).
    'capacitor/android/app/build/**',
  ]),
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/firestoreClient.ts', 'src/lib/firestoreClient.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              importNames: ['setDoc', 'updateDoc', 'addDoc', 'deleteDoc'],
              message:
                "Import these from the central firestore client at '@/lib/firestoreClient' (relative path) instead of 'firebase/firestore' directly. This ensures automatic auth-retry after standby. For batched writes, use 'commitBatch(batch)' from the same module.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
