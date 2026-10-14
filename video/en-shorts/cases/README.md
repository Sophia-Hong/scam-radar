# 실제 사례 사진 칸 (테오 1791947720 · 율 #compliance 1791947826)

쇼츠 첫 장면의 합성 카드 대신 *기관 원자료* 사진을 끼우는 자리. `cases.json` 에 적힌 것만 쓰고, 조건이 하나라도 빠지면 렌더가 멈춘다(`stage.html` assertCase, `check_cases.py`).

조건 (율):
- 출처 = 기관 원자료만(경찰청·금감원 등 보도자료 원문 첨부). 언론 사진·캡처 금지.
- 공공누리 **제1유형**만 (`kogl: 1`). 2~4유형·표시 없음 제외.
- 가릴 것: 계정명·핸들·번호·얼굴·프로필 사진·링크 경로·계좌번호·예금주·사칭당한 회사/기관 이름과 로고·피해자 이름.
- 가리는 것 말고는 손대지 않음. AI 재생성 금지. 로고·"제공/협력" 표기 넣지 않음. 표기는 "출처: 경찰청 보도자료 (날짜)" 한 줄만.
- 장마다 원본 URL · 내려받은 원본(파일+sha256) · 날짜 · 공공누리 유형 기록, **율 대조(yul_ok) 뒤** 렌더.

항목 형식 (`cases.json` 배열):
```json
{ "id": "police-20260901-a",
  "source_url": "https://www.police.go.kr/...",       // 보도자료 원문 페이지
  "original_file": "cases/original/police-20260901-a.png", "original_sha256": "…",
  "redacted_file": "cases/redacted/police-20260901-a.png", "redacted_sha256": "…",
  "date": "2026-09-01", "kogl": 1,
  "credit_ko": "출처: 경찰청 보도자료 (2026-09-01)", "credit_en": "Source: Korean National Police Agency press release (2026-09-01)",
  "redactions": ["handle", "phone", "face", "account_number", "impersonated_org"],
  "yul_ok": "#compliance <ts>",   // 율 대조 메시지. 비어 있으면 렌더 거부
  "caption1_ko": "…", "caption1_en": "…"   // (선택) 첫 장면 자막을 사례에 맞게. caption2_* 도 같음
}
```
렌더: `node record.js v ko police-20260901-a` (셋째 인자 = case id, 없으면 합성판).

시험: 임시 항목으로 확인함(10-14) — 제1유형·율 OK 항목은 첫 장면에 사진 + 표기 한 줄, 라벨 "실제 사례 · 개인정보 가림"(첫 장면만, 이후 제품 화면은 "합성 예시"). 2유형·언론 도메인·sha 불일치는 check_cases.py 와 stage 에서 거부.
