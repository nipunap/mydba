import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ['out/', 'dist/', 'node_modules/', '**/*.js', 'media/**/*.js']
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { 
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            '@typescript-eslint/no-non-null-assertion': 'error',
        }
    }
);

