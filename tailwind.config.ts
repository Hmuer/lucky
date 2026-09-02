import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f7f7f5",
          100: "#eeede8",
          200: "#dcd9cf",
          300: "#b9b4a4",
          500: "#7a7363",
          700: "#3f3a30",
          900: "#1a1814",
        },
        red: {
          ball: "#d9342b",
          ballDark: "#a0231d",
        },
        blue: {
          ball: "#2a72d8",
          ballDark: "#1a4a8e",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
