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
};

export default config;
