import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
	// Ignore patterns (from .eslintignore)
	{
		ignores: [
			'build/',
			'.prettierrc.js',
			'**/.eslintrc.js',
			'admin/words.js',
		],
	},
	// Base TypeScript configuration
	...tseslint.configs.recommended,
	{
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json',
			},
		},
		rules: {
			'@typescript-eslint/no-parameter-properties': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-use-before-define': [
				'error',
				{
					functions: false,
					typedefs: false,
					classes: false,
				},
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					ignoreRestSiblings: true,
					argsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/explicit-function-return-type': [
				'warn',
				{
					allowExpressions: true,
					allowTypedFunctionExpressions: true,
				},
			],
			'@typescript-eslint/no-object-literal-type-assertion': 'off',
			'@typescript-eslint/interface-name-prefix': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off', // This is necessary for Map.has()/get()!
			'no-var': 'error',
			'prefer-const': 'error',
			'no-trailing-spaces': 'error',
		},
	},
	// Prettier integration (must be last)
	eslintPluginPrettier,
	// Override for test files
	{
		files: ['*.test.ts', '**/*.test.ts'],
		rules: {
			'@typescript-eslint/explicit-function-return-type': 'off',
		},
	},
	// Configuration for test directory (JavaScript files)
	{
		files: ['test/**/*.js'],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: 'module',
			globals: {
				require: 'readonly',
				module: 'readonly',
				process: 'readonly',
				describe: 'readonly',
				it: 'readonly',
				before: 'readonly',
				after: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
			},
		},
		rules: {
			'indent': [
				'error',
				'tab',
				{
					'SwitchCase': 1,
				},
			],
			'no-console': 'off',
			'no-unused-vars': [
				'error',
				{
					ignoreRestSiblings: true,
					argsIgnorePattern: '^_',
				},
			],
			'no-var': 'error',
			'no-trailing-spaces': 'error',
			'prefer-const': 'error',
			'quotes': [
				'error',
				'single',
				{
					avoidEscape: true,
					allowTemplateLiterals: true,
				},
			],
			'semi': ['error', 'always'],
		},
	},
);
