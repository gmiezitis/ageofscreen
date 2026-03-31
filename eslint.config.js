const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
    {
        ignores: [
            "node_modules/**",
            "out/**",
            ".webpack/**",
            "src/native/capture_engine/build/**",
            "*.log",
            "compile.log",
            "build.log",
            "build_*.log",
            "forge*.log",
            "out.log",
            "src/**/*.html",
            "tests/run-core-helpers.js",
            "test-crop.js",
        ],
    },
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            "no-case-declarations": "off",
            "no-control-regex": "off",
            "no-empty": "off",
            "no-unused-vars": "off",
            "no-useless-escape": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        },
    },
];
