import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "리딩방 레이더 — SNS 투자사기 유인 계정 탐지",
  description: "Threads 등 SNS 게시물에서 리딩방 유인 계정을 탐지하고 사이버수사대 제출용 증거 리포트를 생성합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-base">리딩방 레이더</Link>
            <Link href="/" className="text-zinc-600 hover:text-zinc-900">계정 조회</Link>
            <Link href="/analyze" className="text-zinc-600 hover:text-zinc-900">텍스트 분석</Link>
            <Link href="/clusters" className="text-zinc-600 hover:text-zinc-900">캠페인</Link>
            <Link href="/review" className="text-zinc-600 hover:text-zinc-900">검토</Link>
            <a href="/api/stats" className="ml-auto text-zinc-400 hover:text-zinc-700">API</a>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
          자동 분석 결과는 법적 판단이 아닙니다 · 최종 신고는 사람이 검토 후 결정합니다
        </footer>
      </body>
    </html>
  );
}
