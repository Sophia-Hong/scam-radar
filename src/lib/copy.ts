import { STRINGS } from "./strings";

/**
 * 화면·README 가 같은 말을 하도록 한 곳에 둔 문구 (Kai 훑기 6번: 홈·텍스트 분석·README 의 기능/데이터 이동 설명이 서로 같은 말).
 * 사실의 근거: /api/analyze 는 문구를 저장하지 않고, 규칙 점수가 경계 구간일 때만 Anthropic Claude Sonnet 5.5 로 보낸다(대체 모델 없음, src/lib/llm.ts).
 * 그 호출의 결과(판정과 체크 항목)는 같은 문구의 재요청을 줄이려고 llm_cache 에 저장될 수 있다.
 */
/** 화면 고지 문구와 같은 말 — 율 최종 국외 이전 문구(strings.ts notice·analyze.notice)를 그대로 가져온다. 옛 "Gemini 등 대체 모델·무료 티어" 문구 삭제(율 국내 배포 점검 ⑥) */
export const DATA_NOTICE = {
  home: `${STRINGS.ko.notice.lead} ${STRINGS.ko.notice.aiOffButton}${STRINGS.ko.notice.leadTail}`,
  analyze: STRINGS.ko.analyze.notice,
  account: "계정 조회는 사람이 쓰도록 공개한 합성 데모 계정만 대상으로 합니다. 그 밖의 계정은 최근 글을 붙여넣어 판독하세요.",
} as const;

export const SUPPORT_SCOPE = "Threads 계정과 게시물·댓글·DM 문구만 확인할 수 있습니다. 일반 웹사이트나 다른 SNS 주소는 아직 지원하지 않습니다.";

/** 합성 데모 계정 — 홈의 "합성 사례 보기"가 여는 계정 (collector/fixtures/samples.json) */
export const DEMO_HANDLE = "sample_vipstock77";
