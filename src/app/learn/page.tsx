import Link from "next/link";
import { LEARN_CARDS, type Source } from "@/lib/learn-cards";
import { serverLang } from "@/lib/lang-server";
import { STRINGS } from "@/lib/strings";

/** /learn — "이렇게 속여요" 정보 카드 8장(휴대폰 폭 카드형, 한영). 문구 = 율 대조 v3 그대로(lib/learn-cards.ts) */
export default async function Learn() {
  const lang = await serverLang();
  const t = STRINGS[lang].learn;
  // 출처는 사례 바로 아래 같은 칸에, 접지 않고(율 1791955493). 사례 없는 카드(영어 4·7)는 할 일 아래. 사례 없는 카드는 '실제 사례' 라벨도 없음
  const source = (src: Source) => (
    <small className="learn-source">
      {t.source}: {src.org} · {src.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a> : `「${src.title}」`} · {src.date}
    </small>
  );
  return (
    <section className="learn" aria-labelledby="learn-title">
      <h1 id="learn-title">{t.title}</h1>
      <ol className="learn-cards">
        {LEARN_CARDS[lang].map((c, i) => (
          <li key={c.title} className="learn-card">
            <div className="learn-num">{String(i + 1).padStart(2, "0")}</div>
            <h2>{c.title}</h2>
            <p className="learn-looks">{c.looks}</p>
            {c.example && (
              <div className="learn-example">
                <b>{t.example}</b>
                {c.example.map((q) => <q key={q}>{q}</q>)}
                {c.source && source(c.source)}
              </div>
            )}
            <p className="learn-todo"><b>{t.todo}</b> {c.todo}</p>
            {!c.example && c.source && source(c.source)}
          </li>
        ))}
      </ol>
      <p className="learn-back"><Link href="/#check">{t.back}</Link></p>
    </section>
  );
}
