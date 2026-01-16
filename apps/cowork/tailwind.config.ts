import sharedConfig from "@ku0/design-system/tailwind.config";
import type { Config } from "tailwindcss";

const config: Config = {
  presets: [sharedConfig],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/shell/src/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}",
  ],
  safelist: ["fixed", "inset-0"],
  theme: {
    extend: {
      animation: {
        shine: "shine 8s ease-in-out infinite",
        "pulse-spring": "pulse-spring 1.8s ease-in-out infinite",
      },
      keyframes: {
        shine: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "pulse-spring": {
          "0%, 100%": { transform: "scale(0.85)" },
          "15%": { transform: "scale(1.15)" },
          "25%": { transform: "scale(0.95)" },
          "35%": { transform: "scale(1.05)" },
          "45%": { transform: "scale(0.98)" },
          "60%": { transform: "scale(1)" },
        },
      },
    },
  },
};

export default config;
