import { LiveAnalyzer } from "@/components/LiveAnalyzer";
import Image from "next/image";

const SIGNALS = [
  ["01", "밖으로 데려가요", "텔레그램·오픈채팅·DM·프로필 링크로 이동을 재촉하는지 봅니다."],
  ["02", "수익을 약속해요", "급등주·원금 보장·손실 복구·수익 인증 같은 미끼를 찾습니다."],
  ["03", "신분을 빌려요", "대기업·증권사 재직과 사원증을 내세워 정보를 주겠다는 구조를 봅니다."],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-label">SCAM RADAR · AI 리딩방 문구 판독</div>
          <h1>사원증까지 위조하는,<br /><em>AI 리딩방 사기</em> —<br />꼭 한번 확인해보아요</h1>
          <p>그럴듯한 경력과 사진에 속기 전에, 의심되는 게시물 문구를 붙여넣어 보세요. 리딩방 유인 신호와 근거를 바로 보여드립니다.</p>
          <a href="#check" className="hero-cta">지금 문구 확인하기 <span aria-hidden="true">↘</span></a>
        </div>

        <div className="evidence-stack" aria-label="서로 다른 사원 정보에 같은 얼굴 사진이 쓰인 게시물 사례">
          <figure className="evidence-card evidence-one">
            <Image src="/evidence-dark.jpeg" alt="삼성전자 사원증을 내세운 Threads 게시물 캡처" width={1290} height={1146} priority sizes="(max-width: 900px) 72vw, 35vw" />
          </figure>
          <figure className="evidence-card evidence-two">
            <Image src="/evidence-light.jpeg" alt="다른 직무와 부서가 적힌 삼성전자 사원증 게시물 캡처" width={1290} height={2172} priority sizes="(max-width: 900px) 68vw, 33vw" />
          </figure>
          <div className="evidence-note">
            <span>CASE 01</span>
            <p>같은 얼굴, 다른 부서·직무.<br />신분 사진도 증거가 아닐 수 있어요.</p>
          </div>
        </div>
      </section>

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
