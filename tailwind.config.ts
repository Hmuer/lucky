import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 深色模式暖灰棕调（不要纯黑）
        ink: {
          50: "#e8e3d8",   // 主文字
          100: "#a09b8c",  // 次文字
          200: "#7a7363",  // 弱文字
          300: "#3a3630",  // 边框
          500: "#34302b",  // 分隔/表头
          700: "#2a2724",  // 卡片
          900: "#1f1d1a",  // 页面背景
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
