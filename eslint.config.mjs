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
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Root JS/MJS config files use eslint-config-next's bundled Babel parser whose
    // scope manager lacks addGlobals() required by ESLint 10. Ignore until upstream fix.
    'next.config.js',
    'eslint.config.mjs',
  ]),
]);

export default eslintConfig;
