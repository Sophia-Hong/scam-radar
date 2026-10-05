import { LiveAnalyzer } from "@/components/LiveAnalyzer";

// 공개 화면에는 신호의 *종류*만 적는다 — 어떤 규칙·가점·구간·임계값으로 판정하는지는 쓰지 않는다 (소현 10-05 12:23, 테오).
const PIPELINE = [
  { step: "01", label: "NORMALIZE", title: "숨긴 글자 복원", description: "글자를 가리거나 바꿔 쓴 표기를 같은 글자로 되돌려 봅니다.", chips: ["표기 변형 복원"] },
  { step: "02", label: "IDENTITY", title: "기관·직업 주장", description: "기관이나 직업을 내세우는 이야기가 있는지 봅니다.", chips: ["기관·직업 주장"] },
  {
    step: "03",
    label: "EVIDENCE",
    title: "증빙 이미지 정황 (수집된 캡처만)",
    description: "수집기가 가져온 캡처에 증빙 이미지가 있을 때만 보조 모델이 글과 이미지 사이의 명백한 모순을 정황으로 검토합니다. 진위 판별이 아니며 단독 근거가 되지 않고, 이 홈에서 붙여넣은 문구에는 적용되지 않습니다(텍스트만).",
    chips: ["수집된 캡처에만", "진위 판별 아님"],
  },
  { step: "04", label: "CONVERSION", title: "투자 유인", description: "수익이나 정보를 미끼로 다음 행동을 요구하는 글인지 봅니다.", chips: ["수익 미끼", "행동 유도"] },
  { step: "05", label: "INFRA", title: "외부 이동 안내", description: "다른 채널로 옮기자는 안내가 있는지, 같은 연락처를 쓰는 계정이 있는지 봅니다.", chips: ["외부 채널 안내", "공유 연락처"] },
  { step: "06", label: "NETWORK", title: "계정·캠페인 연결", description: "비슷한 글이 여러 계정에서 반복되는지 봅니다.", chips: ["반복 게시", "다계정"] },
  { step: "07", label: "CONTEXT", title: "맥락·오탐 방어", description: "피해 후기·경고·뉴스 같은 정상 맥락은 신호로 세지 않으려 합니다.", chips: ["피해·경고 맥락", "정상 활동"] },
];

export default function Home() {
  return (
    <>
      <LiveAnalyzer />

      <section id="criteria" className="criteria" aria-labelledby="criteria-title">
        <header className="criteria-intro">
          <div className="section-kicker"><span /> 판독 기준</div>
          <h2 id="criteria-title"><em>리딩방 유인 신호</em> 판독 파이프라인</h2>
          <p>어떤 종류의 신호를 보는지만 공개합니다. 점수 계산 방식과 기준값은 공개하지 않습니다.</p>
          <div className="engine-badge"><span /> DETERMINISTIC RULE ENGINE · 입력 동일 시 결과 재현</div>
        </header>

        <div className="algorithm-flow" aria-label="리딩방 유인 신호 판독 알고리즘 7단계">
          {PIPELINE.map((item) => (
            <article key={item.step}>
              <div className="algorithm-step"><b>{item.step}</b><span>{item.label}</span></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>{item.chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-note">
        <p>AI는 단서를 찾고, 최종 판단은 사람이 합니다.</p>
        <a href="#check">다른 계정 확인하기 ↑</a>
      </section>
    </>
  );
}
