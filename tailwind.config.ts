import type { Config } from "tailwindcss";

// Map these tokens to your existing design system.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#22c55e",
          600: "#16a34a",
          900: "#052e1a",
        },
        ink: { DEFAULT: "#0b1220", soft: "#475569" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.6" },
          "100%": { transform: "scale(1.25)", opacity: "0" },
        },
      },
      animation: { "pulse-ring": "pulse-ring 2.4s cubic-bezier(.2,.6,.3,1) infinite" },
    },
  },
  plugins: [],
};
export default config;
