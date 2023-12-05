module.exports = {
	env: {
		browser: false,
		commonjs: false,
		mocha: false,
		node: true,
		es6: true,
		es2023: true
	},
	parser: "@typescript-eslint/parser",
	ignorePatterns: [".eslintrc.*"],
	parserOptions: {
		project: "./tsconfig.json",
		sourceType: "module",
		ecmaFeatures: {
			jsx: true,
		},
	},
	settings: {},
	plugins: [
		"jsdoc",
		"@typescript-eslint",
		"unicorn"
	],
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:@typescript-eslint/strict",
		"plugin:@typescript-eslint/strict-type-checked",
		"plugin:unicorn/recommended",
		// "plugin:jsdoc/recommended",
	],
	rules: {
		// Possible Problems
		"array-callback-return": [
			"error",
			{
				"allowImplicit": true
			}
		],
		"no-constant-binary-expression": "warn",
		"no-constructor-return": "warn",
		"no-new-native-nonconstructor": "error",
		"no-promise-executor-return": "error",
		"no-template-curly-in-string": "warn",
		"no-unmodified-loop-condition": "error",
		"no-unreachable-loop": "error",
		"require-atomic-updates": "error",





		// SUGGESTIONS

		// "capitalized-comments": "warn",
		"consistent-return": "warn",
		"curly": ["error", "all"],
		"default-case": "error",
		"default-case-last": "error",
		"default-param-last": "error",
		"dot-notation": "error",
		"eqeqeq": ["error", "always"],
		// "func-names": "warn",
		"guard-for-in": "error",
		"id-denylist": [
			"error",
			"any",
			"Number",
			"number",
			"String",
			"string",
			"Boolean",
			"boolean",
			"Undefined",
			"undefined",
		],
		// "id-match": "error",
		"no-else-return": "error",
		"no-empty-function": "error",
		"no-empty-static-block": "error",
		"no-eq-null": "error",
		"no-eval": "error",
		"no-extra-bind": "error",
		"no-extra-label": "warn",
		"no-floating-decimal": "error",
		"no-invalid-this": "error",
		"no-label-var": "error",
		// "no-magic-numbers": "warn",
		"no-mixed-operators": "error",
		"no-multi-assign": "error",
		"no-new": "error",
		"no-new-func": "error",
		"no-new-wrappers": "warn",
		// "no-object-constructor": "error",
		"no-throw-literal": "error",
		"no-undef-init": "error",
		"no-unused-expressions": "error",
		"no-useless-call": "error",
		"no-useless-computed-key": "error",
		"no-useless-concat": "error",
		// "no-useless-constructor": "error",
		"no-useless-rename": "error",
		"no-var": "error",
		"prefer-const": "error",
		"prefer-rest-params": "error",
		"radix": "error",
		"require-await": "error",
		"spaced-comment": [
			"error",
			"always",
			{
				markers: ["/"],
			},
		],
		"symbol-description": "error",
		"yoda": "error",





		// LAYOUT AND FORMATTING
		"array-bracket-newline": [
			"error",
			{
				multiline: true,
			}
		],
		"array-bracket-spacing": ["error", "never"],
		"array-element-newline": [
			"error",
			{
				ArrayExpression: {
					multiline: true,
					minItems: 3
				},
				ArrayPattern: {
					multiline: true,
				}
			}
		],
		"arrow-spacing": "error",
		"block-spacing": ["error", "always"],
		"brace-style": [
			"error",
			"1tbs", // one true brace style
			{
				allowSingleLine: true,
			}
		],
		"comma-dangle": ["error", "only-multiline"],
		"comma-spacing": [
			"error",
			{
				before: false,
				after: true,
			}
		],
		"comma-style": ["error", "last"],
		"computed-property-spacing": "error",
		"dot-location": ["error", "property"],
		"eol-last": ["error", "always"],
		"func-call-spacing": ["error", "never"],
		"function-call-argument-newline": ["error", "consistent"],
		"function-paren-newline": ["error", "multiline-arguments"],
		"generator-star-spacing": ["error", "before"],
		"implicit-arrow-linebreak": ["error", "beside"],
		// must be off to not interfere with @typescript-eslint/indent
		// "indent": ["error", "tab"],
		"indent": "off",
		"jsx-quotes": ["error", "prefer-double"],
		"key-spacing": [
			"error",
			{
				beforeColon: false,
				afterColon: true,
				mode: "strict",
			}
		],
		"keyword-spacing": [
			"error",
			{
				after: true,
				before: true,
			}
		],
		"linebreak-style": ["error", "unix"],
		/* "lines-around-comment": [
			"error",
			{
				beforeBlockComment: true,
				afterHashtagComment: true,

			}
		], */
		/* "lines-between-class-members": [
			"error",
			{
				enforce: [{ blankLine: "always", prev: "field", next: "method"}, { blankLine: "always", prev: "method", next: "*"}]
			}
		], */
		"max-len": [
			"warn",
			{
				code: 200,
				ignorePattern: "^\\s*import|\\s*\\*?\\s*@api",
				tabWidth: 4,
				ignoreTrailingComments: true,
				ignoreUrls: true,
				ignoreStrings: true,
				ignoreTemplateLiterals: true,
				ignoreRegExpLiterals: true,
			}
		],
		"max-statements-per-line": [
			"error",
			{
				max: 3,
			}
		],
		"multiline-ternary": ["error", "always-multiline"],
		"new-parens": ["error", "always"],
		"newline-per-chained-call": [
			"error",
			{
				ignoreChainWithDepth: 2,
			}
		],
		// "no-extra-parens": ["error", "all"],
		"no-multi-spaces": "warn",
		"no-multiple-empty-lines": [
			"warn",
			{
				max: 5,
				maxEOF: 5,
				maxBOF: 1,
			}
		],
		"no-trailing-spaces": "error",
		"no-whitespace-before-property": "warn",
		"nonblock-statement-body-position": ["error", "beside"],
		"object-curly-newline": [
			"error",
			{
				ObjectExpression: {
					multiline: true,
					minProperties: 5,
					consistent: true,
				},
				ObjectPattern: {
					multiline: true,
				},
				ImportDeclaration: "never",
				ExportDeclaration: {
					multiline: true,
					minProperties: 5,
					consistent: true,
				},
			}
		],
		"object-curly-spacing": ["error", "always"],
		// object-property-newline
		"operator-linebreak": ["error", "before"],
		// padding-line-between-statements
		// must be off to not interfere with @typescript-eslint/quotes
		// "quotes": ["error", "double"],
		"quotes": "off",
		"rest-spread-spacing": ["error", "never"],
		// must be off to not interfere with @typescript-eslint/semi
		// "semi": ["error", "always"],
		"semi": "off",
		"semi-spacing": [
			"error",
			{
				"before": false, "after": true
			}
		],
		"semi-style": ["error", "last"],
		"space-before-blocks": ["error", "always"],
		"space-before-function-paren": [
			"error",
			{
				anonymous: "always",
				named: "never",
				asyncArrow: "always",
			}
		],
		"space-in-parens": ["error", "never"],
		"space-infix-ops": "error",
		"space-unary-ops": [
			"warn",
			{
				words: true,
				nonwords: false,
			}
		],
		"switch-colon-spacing": [
			"error",
			{
				after: true,
				before: false,
			}
		],
		"template-curly-spacing": ["error", "never"],
		"template-tag-spacing": ["error", "never"],
		"wrap-iife": ["error", "inside"],
		"yield-star-spacing": ["error", "after"],





		// TYPESCRIPT
		"@typescript-eslint/explicit-member-accessibility": [
			"error",
			{
				accessibility: "explicit",
				overrides: {
					accessors: "explicit",
					constructors: "off",
				},
			},
		],
		"@typescript-eslint/indent": ["error", "tab"],
		"@typescript-eslint/member-delimiter-style": [
			"error",
			{
				multiline: {
					delimiter: "semi",
					requireLast: true,
				},
				singleline: {
					delimiter: "semi",
					requireLast: false,
				},
			},
		],
		// "@typescript-eslint/naming-convention": "error",
		"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
		"@typescript-eslint/quotes": ["error", "double"],
		"@typescript-eslint/semi": ["error", "always"],
		"@typescript-eslint/type-annotation-spacing": "error",
		"@typescript-eslint/consistent-type-exports": "error",
		"@typescript-eslint/consistent-type-imports": "error",
		"@typescript-eslint/no-unused-vars": [
			"warn",
			{
				vars: "all",
				args: "none",
			}
		],
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-non-null-assertion": "warn",

		"@typescript-eslint/no-unsafe-call": "warn",
		"@typescript-eslint/no-unsafe-member-access": "warn",
		"@typescript-eslint/no-unsafe-return": "warn",
		"@typescript-eslint/no-unsafe-assignment": "warn",
		"@typescript-eslint/restrict-plus-operands": "off",
		"@typescript-eslint/no-unnecessary-condition": "warn",
		"@typescript-eslint/no-unsafe-argument": "warn",
		"@typescript-eslint/no-misused-promises": "off",
		"@typescript-eslint/restrict-template-expressions": "off",




		// JS DOC
		"jsdoc/check-indentation": [
			"warn",
			{
				excludeTags: ["apiExample", "apiErrorExample"]
			}
		],
		/* "jsdoc/check-tag-names": [
			"warn",
			{
				typed: true,
				definedTags: [
					"api",
					"apiName",
					"apiGroup",
					"apiDescription",
					"apiVersion",
					"apiBody",
					"apiSuccess",
					"apiErrorExample",
					"apiExample",
					"apiParam",

				]
			}
		], */


		// UNICORN

		"unicorn/no-array-reduce": "off",
		"unicorn/no-empty-file": "off",
		"unicorn/no-null": "off",
		"unicorn/prefer-switch": "off",
		"unicorn/prefer-ternary": "off",
		"unicorn/prevent-abbreviations": "off",
		"unicorn/throw-new-error": "off",
		"unicorn/filename-case": "off",
		"require-await": "off"
	},
};
