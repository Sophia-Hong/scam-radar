"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { STRINGS, type Lang, type Strings } from "./strings";

/**
 * 한영 전환 — 첫 값은 서버(layout)가 쿠키 `lang` → Accept-Language 순으로 정해 내려 준다(깜빡임 없음).
 * 바꾸면 쿠키에 1년 기억한다. 문구 정본은 `strings.ts` 한 곳.
 */
const LangContext = createContext<{ lang: Lang; t: Strings; setLang: (l: Lang) => void }>({
  lang: "en",
  t: STRINGS.en,
  setLang: () => {},
});

export function LangProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const router = useRouter();
  function setLang(l: Lang) {
    setLangState(l);
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    router.refresh();   // 서버가 그린 부분(리포트 본문·메타)도 같은 언어로 다시 — 한 화면에 한영이 섞이지 않게(카이 5808c65)
  }
  return <LangContext.Provider value={{ lang, t: STRINGS[lang], setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button type="button" aria-pressed={lang === "ko"} onClick={() => setLang("ko")}>한국어</button>
    </div>
  );
}

/** layout 의 nav·footer 처럼 서버 컴포넌트 안에 끼우는 한 줄 문구 */
export function T({ k }: { k: "navCheck" | "navCriteria" | "navCta" | "footer" }) {
  return <>{useLang().t.layout[k]}</>;
}
