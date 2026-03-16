import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

export default [
    // Global ignores
    {
        ignores: ['js/vendor/**', 'js/**/*.d.ts']
    },
    // JS files — preserve existing relaxed rules
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                gapi: 'readonly',
                Buffer: 'readonly',
                QUnit: 'readonly'
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            'no-unused-vars': 'off',
            'no-prototype-builtins': 'off',
            'no-empty': 'off',
            'no-useless-escape': 'off',
            'no-cond-assign': 'off',
            'no-constant-condition': ['error', {checkLoops: false}],
            'no-control-regex': 'off',
            'require-atomic-updates': 'off',
            'no-inner-declarations': 'off',
            'no-case-declarations': 'off',
            'no-redeclare': 'off',
            'no-useless-assignment': 'off',
            'valid-typeof': 'off',
            'no-undef': 'off',
            'no-fallthrough': 'off',
            'no-sparse-arrays': 'off',
            'no-async-promise-executor': 'off',
            'getter-return': 'off',
            'no-self-assign': 'off',
            'no-unused-private-class-members': 'off',
            'no-unassigned-vars': 'off',
            'preserve-caught-error': 'off'
        }
    },
    // TS files — stricter rules
    {
        files: ['js/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json'
            },
            globals: {
                ...globals.browser
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': 'allow-with-description' }]
        }
    }
]
