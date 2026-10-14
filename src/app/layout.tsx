import type { Metadata } from "next";
import Link from "next/link";
import { LangProvider, LangToggle, T } from "@/lib/i18n";
import { STRINGS } from "@/lib/strings";
import { serverLang } from "@/lib/lang-server";
import "./globals.css";

const currentLang = serverLang;

/**
 * 모든 페이지가 같은 title·공유 미리보기(제목·설명·일반 이미지)를 쓴다 — 계정·리포트 페이지도 하위 generateMetadata 를 두지 않는다.
 * 미리보기에 계정명·핸들·링크·위험 배너를 넣지 않는다(율 1791946996, 테오 1791947005). 브랜드명 "Scam Radar" 는 예외(율 OK).
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = await currentLang();
  const m = STRINGS[lang].meta;
  const image = { url: `/og-${lang}.png`, width: 1200, height: 630, alt: m.title };
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://scam-radar-sooty.vercel.app"),
    title: m.title, description: m.description, robots: { index: false, follow: false },
    openGraph: { title: m.title, description: m.description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [image.url] },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang}>
      <body>
        <LangProvider initial={lang}>
          <header className="site-header">
            <nav>
              <Link href="/" className="brand"><span className="brand-dot" />SCAM RADAR</Link>
              <div className="nav-links">
                <Link href="/#check"><T k="navCheck" /></Link>
                <Link href="/#criteria"><T k="navCriteria" /></Link>
              </div>
              <LangToggle />
              <Link className="nav-cta" href="/#check"><T k="navCta" /></Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>SCAM RADAR</span>
            <p><T k="footer" /></p>
          </footer>
        </LangProvider>
      </body>
    </html>
  );
}
