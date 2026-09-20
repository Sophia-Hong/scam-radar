import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scam Radar — AI 리딩방 문구 판독",
  description: "의심되는 게시물 문구를 붙여넣으면 리딩방 유인 신호와 근거를 실시간으로 확인합니다.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <nav>
            <Link href="/" className="brand"><span className="brand-dot" />SCAM RADAR</Link>
            <div className="nav-links">
              <Link href="/#check">실시간 판독</Link>
              <Link href="/#criteria">판독 기준</Link>
            </div>
            <Link className="nav-cta" href="/#check">문구 확인하기</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <span>SCAM RADAR</span>
          <p>자동 분석 결과는 법적 판단이 아니며, 특정 계정을 사기로 단정하지 않습니다.</p>
        </footer>
      </body>
    </html>
  );
}
