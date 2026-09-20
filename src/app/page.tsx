import { LiveAnalyzer } from "@/components/LiveAnalyzer";

const PIPELINE = [
  {
    step: "01",
    label: "NORMALIZE",
    title: "숨긴 글자 복원",
    description: "제로폭 문자와 구분자 제거, 영문 혼동문자 폴딩, 한글 초성 복원을 통한 단일 비교 표현 정규화.",
    chips: ["NFKC", "초성 복원", "혼동문자", "제로폭 제거"],
  },
  {
    step: "02",
    label: "SIGNALS",
    title: "7개 신호군 탐지",
    description: "연락 유도·투자·수익·긴급성·무료 미끼·링크·기관 사칭을 어휘 사전과 정규식 구조 신호로 동시 탐지.",
    chips: ["연락 최대 32", "투자 최대 28", "수익 최대 24", "사칭 최대 20"],
  },
  {
    step: "03",
    label: "COMBINE",
    title: "유인 구조 조합 분석",
    description: "단일 키워드가 아닌 연락 유도 × 투자·수익 약속의 동시 출현 계산. 사칭·행동 유도 결합에 추가 가중치 적용.",
    chips: ["연락×투자 +15", "3요소 결합 +6", "사칭 구조 +25", "행동 유도 +14"],
  },
  {
    step: "04",
    label: "NETWORK",
    title: "계정 간 연결 탐지",
    description: "공유 연락처, 반복 문구, 다계정 살포 관계 연결. 문자 3-gram, MinHash, Jaccard 유사도를 통한 근사 중복 판별.",
    chips: ["공유 연락처", "MinHash 128", "Jaccard ≥ .75", "다계정 +15~32"],
  },
  {
    step: "05",
    label: "DECIDE",
    title: "오탐 확률 제어",
    description: "피해 후기·경고·인용 맥락 감점, 고위험 관문 및 점수 상한 적용. 자동 판정의 과잉 확신 억제.",
    chips: ["LOW 0–39", "REVIEW 40–69", "HIGH 70–100", "근거 코드 출력"],
  },
];

const WEIGHTS = [
  ["메신저 유도", "+22", "텔레그램·오픈채팅·프로필 링크"],
  ["연락 + 투자/수익", "+15", "상이한 신호군 동시 출현"],
  ["기관 사칭 구조", "+25", "기관명 + 재직·증빙 + 정보 제안"],
  ["여러 계정의 동일 문구", "+15~32", "2개 계정부터 가중, 3개부터 관문 충족"],
  ["피해·경고 맥락", "최대 −45", "피해·예방 문맥에 대한 오탐 억제"],
];

export default function Home() {
  return (
    <>
      <LiveAnalyzer />

      <section id="criteria" className="criteria" aria-labelledby="criteria-title">
        <header className="criteria-intro">
          <div className="section-kicker"><span /> 판독 기준</div>
          <h2 id="criteria-title"><em>리딩방 유인 신호</em> 판독 파이프라인</h2>
          <p>텍스트 정규화, 구조 신호 결합, 계정 네트워크 분석, 오탐 제어를 순차 적용하는 설명 가능한 규칙 기반 판독 체계.</p>
          <div className="engine-badge"><span /> DETERMINISTIC RULE ENGINE · 입력 동일 시 결과 재현</div>
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
            <h3>가중치 누적과 상한 규칙</h3>
            <p className="formula-line"><b>카테고리 점수</b> + <b>결합 가점</b> + <b>계정·네트워크 보정</b> − <b>경고·피해 맥락 감점</b></p>
            <div className="hard-gate">
              <span>HIGH GATE</span>
              <p>다음 중 최소 1개 충족 필요: <b>연락처 유도</b> · <b>기관 사칭 결합</b> · <b>3개 이상 계정의 동일 문구</b>. 미충족 시 총점 69점 상한.</p>
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
              <div><b>LOW</b><span>0–39</span><small>유인 구조 근거 불충분</small></div>
              <div><b>REVIEW</b><span>40–69</span><small>사람·보조 모델 검토 구간</small></div>
              <div><b>HIGH</b><span>70–100</span><small>고위험 관문 충족·근거 확보</small></div>
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
