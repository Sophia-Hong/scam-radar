/**
 * 화면·README 가 같은 말을 하도록 한 곳에 둔 문구 (Kai 훑기 6번: 홈·텍스트 분석·README 의 기능/데이터 이동 설명이 서로 같은 말).
 * 사실의 근거: /api/analyze 는 문구를 저장하지 않고, 규칙 점수가 경계 구간일 때만 Gemini API 로 보낸다(src/lib/llm.ts).
 * 그 호출의 결과(판정 + 한 줄 근거)는 같은 문구의 재요청을 줄이려고 llm_cache 에 저장될 수 있다.
 */
export const DATA_NOTICE = {
  home: "붙여넣은 문구 원문은 저장하지 않습니다. 판독은 이 브라우저 안에서 먼저 이루어지고, 규칙만으로 가르기 애매한 경우에만 문구가 서버를 거쳐 Google Gemini API로 전송됩니다(무료 티어 입력은 Google의 제품 개선에 사용될 수 있습니다). 이때 AI 재검토 결과(판정과 한 줄 근거)는 같은 문구의 재요청을 줄이려고 저장될 수 있습니다.",
  analyze: "이 페이지는 AI 재검토를 쓰지 않고, 입력한 문구는 브라우저 밖으로 나가지 않습니다. (홈 화면의 판독은 애매한 경우에만 Gemini API로 전송됩니다.)",
  account: "계정 조회는 사람이 쓰도록 공개한 합성 데모 계정만 대상으로 합니다. 그 밖의 계정은 최근 글을 붙여넣어 판독하세요.",
} as const;

export const SUPPORT_SCOPE = "Threads 계정과 게시물·댓글·DM 문구만 확인할 수 있습니다. 일반 웹사이트나 다른 SNS 주소는 아직 지원하지 않습니다.";

/** 합성 데모 계정 — 홈의 "합성 사례 보기"가 여는 계정 (collector/fixtures/samples.json) */
export const DEMO_HANDLE = "sample_vipstock77";
