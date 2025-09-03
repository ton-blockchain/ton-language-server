import path from "node:path"
import tseslint from "typescript-eslint"
import url from "node:url"
import unusedImports from "eslint-plugin-unused-imports"
import unicornPlugin from "eslint-plugin-unicorn"
import functional from "eslint-plugin-functional"

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

export default tseslint.config(
    // register plugins
    {
        plugins: {
            ["@typescript-eslint"]: tseslint.plugin,
            ["@unused-imports"]: unusedImports,
            functional: functional,
        },
    },

    // add files and folders to be ignored
    {
        ignores: [
            "**/*.js",
            "eslint.config.mjs",
            ".github/*",
            ".yarn/*",
            ".vscode-test/*",
            "dist/*",
            "docs/*",
            "server/src/languages/tolk/tree-sitter-tolk/",
            "server/src/languages/fift/tree-sitter-fift/",
            "server/src/languages/tolk/tree-sitter-tolk/",
            "server/src/languages/func/tree-sitter-func/",
            "server/src/languages/tlb/tree-sitter-tlb/",
        ],
    },

    tseslint.configs.all,
    unicornPlugin.configs["flat/all"],

    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },

        rules: {
            // override typescript-eslint
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/prefer-literal-enum-member": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/typedef": [
                "error",
                {parameter: true, memberVariableDeclaration: true},
            ],
            "@typescript-eslint/consistent-generic-constructors": ["error", "type-annotation"],
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/explicit-function-return-type": [
                "error",
                {
                    allowExpressions: true,
                },
            ],
            "@typescript-eslint/prefer-optional-chain": "off",
            "@typescript-eslint/no-extraneous-class": "off",
            "@typescript-eslint/no-magic-numbers": "off",
            "@typescript-eslint/no-unsafe-type-assertion": "off",
            "@typescript-eslint/prefer-readonly-parameter-types": "off",
            "@typescript-eslint/member-ordering": "off",
            "@typescript-eslint/parameter-properties": "off",
            "@typescript-eslint/method-signature-style": "off",
            "@typescript-eslint/prefer-destructuring": "off",
            "@typescript-eslint/strict-boolean-expressions": "off",
            "@typescript-eslint/no-use-before-define": "off",
            "@typescript-eslint/class-methods-use-this": "off",
            "@typescript-eslint/no-shadow": "off",
            "@typescript-eslint/consistent-type-imports": "off",
            "@typescript-eslint/naming-convention": "off",
            "@typescript-eslint/max-params": "off",
            "@typescript-eslint/no-invalid-this": "off",
            "@typescript-eslint/init-declarations": "off",
            "@typescript-eslint/dot-notation": "off",

            "@unused-imports/no-unused-imports": "error",
            "no-duplicate-imports": "error",

            "functional/type-declaration-immutability": [
                "error",
                {
                    rules: [
                        {
                            identifiers: ".+",
                            immutability: "ReadonlyShallow",
                            comparator: "AtLeast",
                        },
                    ],
                },
            ],
            "functional/readonly-type": ["error", "keyword"],

            // override unicorn
            "unicorn/no-null": "off",
            "unicorn/prevent-abbreviations": "off",
            "unicorn/no-array-for-each": "off",
            "unicorn/import-style": "off",
            "unicorn/filename-case": "off",
            "unicorn/consistent-function-scoping": "off",
            "unicorn/no-nested-ternary": "off",
            "unicorn/prefer-module": "off",
            "unicorn/prefer-string-replace-all": "off",
            "unicorn/no-process-exit": "off",
            "unicorn/number-literal-case": "off", // prettier changes to lowercase
            "unicorn/no-lonely-if": "off",
            "unicorn/prefer-top-level-await": "off",
            "unicorn/no-static-only-class": "off",
            "unicorn/no-keyword-prefix": "off",
            "unicorn/prefer-json-parse-buffer": "off",
            "unicorn/no-array-reduce": "off",
            "unicorn/prefer-string-raw": "off",
            "unicorn/no-useless-undefined": "off",
            "unicorn/require-post-message-target-origin": "off",
        },
    },
)
