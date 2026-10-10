import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import betterTailwind from "eslint-plugin-better-tailwindcss";
import tseslint from "typescript-eslint";

// The design system is closed (ADR 0004): only src/shared/ui may use raw interactive
// elements, inline styles or the dark: variant. Everything else composes its primitives.
const RAW_ELEMENTS = "table|button|input|select|textarea|dialog";
const PHYSICAL_CLASSES =
  "-?m[lr]-|p[lr]-|left-|right-|text-(left|right)$|rounded-([lr]|[tb][lr])(-|$)|border-[lr](-|$)|scroll-[mp][lr]-|float-(left|right)$|clear-(left|right)$|inset-[se]-";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
  {
    files: ["**/*.{ts,tsx,mts}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-await-in-loop": "error",
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Inside the design system arbitrary values are allowed, but every class must still exist.
    files: ["src/shared/ui/**/*.tsx"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/shared/ui/theme.css" } },
    rules: { "better-tailwindcss/no-unknown-classes": "error" },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/shared/ui/**"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "src/shared/ui/theme.css" } },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXOpeningElement[name.name=/^(${RAW_ELEMENTS})$/]`,
          message:
            "Use the primitive from @/shared/ui (Button, Input, DataTable...). Missing one? Add it to shared/ui first.",
        },
        {
          selector: "JSXAttribute[name.name='style']",
          message:
            "No inline styles outside shared/ui. Use tokens through classes, or add a variant to the primitive.",
        },
      ],
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern: "\\[([^\\[\\]]*?)\\](?!:)",
              message: "No arbitrary values. Use a token from theme.css.",
            },
            { pattern: "\\(", message: "No arbitrary CSS variables. Use a token from theme.css." },
            { pattern: "^!.*|.*!$", message: "No !important." },
            { pattern: "^dark:", message: "No dark: outside shared/ui. Tokens switch with the theme." },
            {
              pattern: "(^|:)(text|bg|fill|stroke)-status-",
              message: "Status colors only via Chip or FormError from @/shared/ui.",
            },
            {
              pattern: "(^|:)(border|outline|ring|divide)(-|$)",
              message: "No borders: solid fills only (DESIGN.md). Separate with space or a surface tone.",
            },
            {
              pattern: `(^|:)-?(${PHYSICAL_CLASSES})`,
              message: "Use logical classes (ms-, me-, ps-, pe-, start-, end-, text-start).",
            },
          ],
        },
      ],
    },
  },
]);
