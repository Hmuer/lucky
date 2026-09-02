import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "双色球守号监控",
  description: "官方开奖自动核对 / 复式+胆拖 / 盈亏统计",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="border-b border-ink-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-6 h-6 rounded-full ball-red text-[10px] items-center justify-center font-bold">红</span>
              <span className="inline-flex w-6 h-6 rounded-full ball-blue text-[10px] items-center justify-center font-bold">蓝</span>
              <span className="ml-2 font-semibold tracking-wide">双色球守号监控</span>
            </div>
            <nav className="flex gap-1 text-sm">
              <Link className="px-3 py-1.5 rounded-md hover:bg-ink-100" href="/">首页</Link>
              <Link className="px-3 py-1.5 rounded-md hover:bg-ink-100" href="/bets">守号管理</Link>
              <Link className="px-3 py-1.5 rounded-md hover:bg-ink-100" href="/history">历史记录</Link>
              <Link className="px-3 py-1.5 rounded-md hover:bg-ink-100" href="/stats">统计</Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="max-w-6xl mx-auto px-4 py-8 text-xs text-ink-500">
          数据源：中国福利彩票（中彩网 cwl.gov.cn）。本工具仅供个人记账核对，非投注平台。
        </footer>
      </body>
    </html>
  );
}
