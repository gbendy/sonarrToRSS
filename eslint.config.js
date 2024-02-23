const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const stylisticTs  = require('@stylistic/eslint-plugin-ts');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
    '@stylistic/ts': stylisticTs
    },
    rules: {
      '@/eol-last': ["error", "always"]
    }
  }
);