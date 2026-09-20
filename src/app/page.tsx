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
    label: "IDENTITY",
    title: "재직·퇴직 사칭 서사",
    description: "한국 기업·증권사 이름, 재직·퇴직 경력, 내부자 주장과 정보 제공 제안이 실제로 결합되는지 분석.",
    chips: ["기관명", "재직·퇴직", "내부자 주장", "제안 구조"],
  },
  {
    step: "03",
    label: "EVIDENCE",
    title: "페이크 증빙 이미지 정황",
    description: "사원증·급여명세·재직증명 이미지가 동반된 사칭 후보만 선택적으로 보조 모델이 시각적 모순을 검토.",
    chips: ["OCR 맥락", "로고·레이아웃", "합성 정황", "단독 확정 금지"],
  },
  {
    step: "04",
    label: "CONVERSION",
    title: "투자 유인 전환 구조",
    description: "신뢰 형성에서 무료 정보·수익 인증·상담 제안·입장 요청으로 이어지는 단계적 전환 구조를 조합 분석.",
    chips: ["신뢰 형성", "수익 미끼", "상담 제안", "행동 유도"],
  },
  {
    step: "05",
    label: "INFRA",
    title: "외부 이동 인프라",
    description: "본문·프로필의 메신저 주소, 오픈채팅, 전화번호, 링크모음과 동일 연락처를 사용하는 계정을 연결.",
    chips: ["메신저 ID", "프로필 링크", "공유 연락처", "외부 도메인"],
  },
  {
    step: "06",
    label: "NETWORK",
    title: "계정·캠페인 연결",
    description: "문장 일부가 바뀌어도 문자 3-gram과 MinHash로 유사 서사를 묶고, 여러 게시물·계정의 반복 살포를 탐지.",
    chips: ["근사 중복", "다계정 살포", "댓글 확산", "캠페인 군집"],
  },
  {
    step: "07",
    label: "CONTEXT",
    title: "신원 맥락·오탐 제어",
    description: "한국 기관 경력 주장과 프로필 국가 불일치를 보조 신호로 검토하고, 피해 후기·뉴스·경고·정상 직장인 맥락은 억제.",
    chips: ["가입 국가", "계정 연령", "피해자 맥락", "사람 검토"],
  },
];

const WEIGHTS = [
  ["콘텐츠 신호", "복합", "낱말 하나가 아닌 사칭·수익·행동 유도 조합"],
  ["증빙 이미지", "선택 검토", "기관 사칭 후보의 이미지에만 보조 모델 사용"],
  ["외부 인프라", "연결", "공유 연락처·링크·메신저 ID로 계정 군집화"],
  ["확산 행동", "연결", "유사한 사칭 서사의 다게시물·다계정 살포"],
  ["오탐 방어", "상한", "피해·경고·뉴스·정상 활동 맥락 우선 검토"],
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

        <div className="score-system">
          <div className="score-formula">
            <span className="score-system-label">SCORING LOGIC</span>
            <h3>복합 근거 누적과 상한 규칙</h3>
            <p className="formula-line"><b>카테고리 점수</b> + <b>결합 가점</b> + <b>계정·네트워크 보정</b> − <b>경고·피해 맥락 감점</b></p>
            <div className="hard-gate">
              <span>HIGH GATE</span>
              <p>강한 판정에는 <b>외부 이동</b> · <b>기관 사칭 결합</b> · <b>다계정 확산</b> 중 하나 이상의 구조적 근거가 필요합니다. 정확한 운영 임계값은 공개하지 않습니다.</p>
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
              <div><b>LOW</b><span>낮은 구간</span><small>유인 구조 근거 불충분</small></div>
              <div><b>REVIEW</b><span>검토 구간</span><small>사람·보조 모델 추가 검토</small></div>
              <div><b>HIGH</b><span>강한 신호</span><small>구조적 근거 복수 확보</small></div>
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
