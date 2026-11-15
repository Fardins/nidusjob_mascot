import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".venv/**", "public/decoders/**", "test-results/**", "playwright-report/**"],
  },
  {
    rules: {
      // R3F mutates refs/three objects every frame by design.
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // The brain must stay three.js-free (testable, main-bundle safe).
    files: ["components/mascot/brain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["three", "three/*", "@react-three/*"] }],
    },
  },
];

export default eslintConfig;
