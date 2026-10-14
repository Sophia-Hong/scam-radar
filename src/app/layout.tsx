import type { Metadata } from "next";
import Link from "next/link";
import { LangProvider, LangToggle, T } from "@/lib/i18n";
import { STRINGS } from "@/lib/strings";
import { serverLang } from "@/lib/lang-server";
import "./globals.css";

const currentLang = serverLang;

export async function generateMetadata(): Promise<Metadata> {
  const m = STRINGS[await currentLang()].meta;
  return { title: m.title, description: m.description, robots: { index: false, follow: false } };
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
