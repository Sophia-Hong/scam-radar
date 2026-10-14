"use client";

import { useLang } from "@/lib/i18n";

// 공개 화면에는 신호의 *종류*만 적는다 — 어떤 규칙·가점·구간·임계값으로 판정하는지는 쓰지 않는다 (소현 10-05 12:23, 테오).
export function Criteria() {
  const c = useLang().t.criteria;
  return (
    <>
      <section id="criteria" className="criteria" aria-labelledby="criteria-title">
        <header className="criteria-intro">
          <div className="section-kicker"><span /> {c.kicker}</div>
          <h2 id="criteria-title"><em>{c.title1}</em>{c.title2}</h2>
          <p>{c.lead}</p>
          <div className="engine-badge"><span /> {c.badge}</div>
        </header>

        <div className="algorithm-flow" aria-label={c.aria}>
          {c.steps.map((item, i) => (
            <article key={item.label}>
              <div className="algorithm-step"><b>{String(i + 1).padStart(2, "0")}</b><span>{item.label}</span></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>{item.chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-note">
        <p>{c.closing}</p>
        <a href="#check">{c.closingLink}</a>
      </section>
    </>
  );
}
