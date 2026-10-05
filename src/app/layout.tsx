import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scam Radar — Threads 리딩방 계정 확인",
  description: "Threads 계정과 게시물 문구를 확인해 리딩방 유인 신호와 근거를 바로 보여드립니다. 합성 데모 계정과 붙여넣은 문구만 대상으로 하며, 자동 분석은 법적 판단이 아닙니다.",
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
              <Link href="/#check">계정 확인</Link>
              <Link href="/#criteria">판독 기준</Link>
            </div>
            <Link className="nav-cta" href="/#check">계정 확인하기</Link>
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
