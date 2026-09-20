import { LiveAnalyzer } from "@/components/LiveAnalyzer";

const SIGNALS = [
  ["01", "밖으로 데려가요", "텔레그램·오픈채팅·DM·프로필 링크로 이동을 재촉하는지 봅니다."],
  ["02", "수익을 약속해요", "급등주·원금 보장·손실 복구·수익 인증 같은 미끼를 찾습니다."],
  ["03", "신분을 빌려요", "대기업·증권사 재직과 사원증을 내세워 정보를 주겠다는 구조를 봅니다."],
];

export default function Home() {
  return (
    <>
      <LiveAnalyzer />

      <section id="criteria" className="criteria" aria-labelledby="criteria-title">
        <div>
          <div className="section-kicker"><span /> 판독 기준</div>
          <h2 id="criteria-title">말보다 <em>유인 구조</em>를 봅니다.</h2>
        </div>
        <div className="signal-list">
          {SIGNALS.map(([number, title, description]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-note">
        <p>AI는 단서를 찾고, 최종 판단은 사람이 합니다.</p>
        <a href="#check">다른 문구 판독하기 ↑</a>
      </section>
    </>
  );
}
