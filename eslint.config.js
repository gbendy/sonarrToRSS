const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const stylisticTs  = require('@stylistic/eslint-plugin-ts');
const html = require('@html-eslint/eslint-plugin');
const parser = require('@html-eslint/parser');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
    '@stylistic/ts': stylisticTs
    },
    rules: {
      '@/eol-last': ['error', 'always'],
      '@/quotes': [ 'error', 'single' ],
      'camelcase': [ 'error' ],
      'no-trailing-spaces': [ 'error']
    }
  },
  {
    ...html.configs['flat/recommended'],
    files: ['src/**/*.handlebars'],
    rules: {
      ...html.configs['flat/recommended'].rules,
      '@html-eslint/indent': [ 'off', 2 ],
      '@html-eslint/element-newline': [ 'off' ],
      '@html-eslint/no-duplicate-id': [ 'off' ]
    }
  }
);