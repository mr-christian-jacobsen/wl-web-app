import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  // Dark mode is class-driven so the user's stored preference (or OS preference
  // for "system" mode) toggles it deterministically — independent of the
  // browser's prefers-color-scheme media query.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
