import { LiveAnalyzer } from "@/components/LiveAnalyzer";

const PIPELINE = [
  {
    step: "01",
    label: "NORMALIZE",
    title: "숨긴 글자를 되돌려요",
    description: "제로폭 문자·구분자를 걷어내고, 영문 혼동문자와 한글 초성을 같은 비교 형태로 바꿉니다.",
    chips: ["NFKC", "초성 복원", "혼동문자", "제로폭 제거"],
  },
  {
    step: "02",
    label: "SIGNALS",
    title: "7개 신호군을 찾아요",
    description: "연락 유도, 투자, 수익, 긴급성, 무료 미끼, 링크, 기관 사칭을 어휘와 문장 구조로 함께 찾습니다.",
    chips: ["연락 최대 32", "투자 최대 28", "수익 최대 24", "사칭 최대 20"],
  },
  {
    step: "03",
    label: "COMBINE",
    title: "낱말보다 조합을 봐요",
    description: "‘텔레그램’ 하나가 아니라 연락 유도와 투자·수익 약속이 함께 나타나는 유인 구조에 가점을 줍니다.",
    chips: ["연락×투자 +15", "3요소 결합 +6", "사칭 구조 +25", "행동 유도 +14"],
  },
  {
    step: "04",
    label: "NETWORK",
    title: "계정 사이 연결을 봐요",
    description: "같은 연락처, 반복 문구, 여러 계정 살포를 묶습니다. 문구 유사도는 문자 3-gram과 MinHash로 계산합니다.",
    chips: ["공유 연락처", "MinHash 128", "Jaccard ≥ .75", "다계정 +15~32"],
  },
  {
    step: "05",
    label: "DECIDE",
    title: "상한선을 거쳐 분류해요",
    description: "피해 후기·경고·인용문은 점수를 낮추고, 자동 고위험 판정에는 반드시 강한 관문 신호를 요구합니다.",
    chips: ["0–39 낮음", "40–69 검토", "70–100 높음", "근거 함께 출력"],
  },
];

const WEIGHTS = [
  ["메신저 유도", "+22", "텔레그램·오픈채팅·프로필 링크"],
  ["연락 + 투자/수익", "+15", "서로 다른 신호가 같이 있을 때"],
  ["기관 사칭 구조", "+25", "기관명 + 재직·증빙 + 정보 제안"],
  ["여러 계정의 동일 문구", "+15~32", "계정 2개부터, 3개면 고위험 관문"],
  ["피해·경고 맥락", "최대 −45", "피해 후기와 예방 글의 오탐 방지"],
];

export default function Home() {
  return (
    <>
      <LiveAnalyzer />

      <section id="criteria" className="criteria" aria-labelledby="criteria-title">
        <header className="criteria-intro">
          <div className="section-kicker"><span /> 판독 기준</div>
          <h2 id="criteria-title">문장이 <em>위험 점수</em>가 되기까지</h2>
          <p>단어 몇 개로 계정을 낙인찍지 않습니다. 글자를 복원하고, 유인 구조와 계정 연결을 계산한 뒤, 오탐 방지 관문을 통과한 결과만 근거와 함께 보여줍니다.</p>
          <div className="engine-badge"><span /> 규칙 기반 1차 판독 · 같은 입력은 같은 결과</div>
        </header>

        <div className="algorithm-flow" aria-label="리딩방 유인 신호 판독 알고리즘 5단계">
          {PIPELINE.map((item) => (
            <article key={item.step}>
              <div className="algorithm-step"><b>{item.step}</b><span>{item.label}</span></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <ul>{item.chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
            </article>
          ))}
        </div>

        <div className="score-system">
          <div className="score-formula">
            <span className="score-system-label">SCORING LOGIC</span>
            <h3>점수는 더하기만 하지 않아요.</h3>
            <p className="formula-line"><b>기본 신호</b> + <b>조합 가점</b> + <b>계정·네트워크</b> − <b>경고 맥락</b></p>
            <div className="hard-gate">
              <span>HIGH GATE</span>
              <p><b>연락처 유도</b> · <b>기관 사칭 결합</b> · <b>3개 이상 계정의 동일 문구</b> 중 하나가 없으면, 점수가 높아도 최대 69점에서 멈춥니다.</p>
            </div>
          </div>

          <div className="weight-table" role="table" aria-label="주요 판독 가중치">
            {WEIGHTS.map(([signal, points, note]) => (
              <div role="row" key={signal}>
                <strong role="cell">{signal}</strong>
                <b role="cell">{points}</b>
                <span role="cell">{note}</span>
              </div>
            ))}
          </div>

          <div className="risk-scale" aria-label="위험도 점수 구간">
            <div className="risk-scale-title"><span>최종 위험도</span><small>0—100</small></div>
            <div className="risk-track"><i /><i /><i /></div>
            <div className="risk-labels">
              <div><b>LOW</b><span>0–39</span><small>뚜렷한 유인 구조 없음</small></div>
              <div><b>REVIEW</b><span>40–69</span><small>사람·보조 모델 추가 검토</small></div>
              <div><b>HIGH</b><span>70–100</span><small>강한 관문 신호와 근거 있음</small></div>
            </div>
          </div>
        </div>
      </section>

      <section className="closing-note">
        <p>AI는 단서를 찾고, 최종 판단은 사람이 합니다.</p>
        <a href="#check">다른 계정 확인하기 ↑</a>
      </section>
    </>
  );
}
