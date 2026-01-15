import path from "node:path";
import type { Config } from "tailwindcss";
import { sharedThemeExtend } from "./tailwind";

const config: Config = {
  darkMode: "class",
  content: [
    path.join(__dirname, "../../shared/src/**/*.{ts,tsx}"),
    path.join(__dirname, "../../shell/src/**/*.{ts,tsx}"),
    path.join(__dirname, "../../design-system/src/**/*.{ts,tsx}"),
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: sharedThemeExtend,
  },
  plugins: [],
};

export default config;
