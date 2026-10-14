# 리딩방 레이더 (Scam Radar)

SNS(Threads) 게시물에서 **주식·코인 리딩방 유인 계정**을 탐지하고, 사이버수사대·금감원 제출용 **증거 리포트**를 자동 생성하는 시스템.
정부가 아닌 민간이 할 수 있는 구간 — *탐지 → 증거 정리 → 신고 준비* — 까지만 만든다. 신고 제출은 사람이 한다.

```
Aside 브라우저(로컬, 로그인 세션)  ──JSON+캡처──▶  collector/push.ts  ──POST /api/ingest──▶  Vercel
                                                                                          │
   판정: 정규화 → 룰 스코어 → 근사 중복 묶기 → (애매한 경우만) LLM 재판정                        │
                                                                                          ▼
   조회 / · 텍스트 분석 /analyze · 캠페인 /clusters · 신고서 /report/:id · 사람 검토 /review · REST /api/*
```

## 왜 이 구조인가 (비용·부하)

| 결정 | 이유 |
|---|---|
| 수집기는 **내 PC 에서 Aside 로** 실행 | Vercel 함수는 10~60초 제한이라 브라우저 상시 실행 불가. Playwright 는 Threads 에 막힘. 로그인 세션·IP 도 로컬이 안전 |
| 판정은 **화면이 아니라 코드**가 | AI 브라우저는 {URL·작성자·본문·캡처}만 뽑는다. 판정 로직이 코드에 있어야 재현·검증·튜닝이 된다 |
| **룰 엔진 1차**, LLM 은 애매한 경우만 | BotometerLite 처럼 ML 은 도메인 밖에서 무너진다. LLM 호출은 건당 수 원이라 애매한 경우에만 쓴다 |
| **LLM 결과 캐시** (`llm_cache`, 내용·이미지 해시) | 같은 문구·증빙 재수집 시 0원 |
| **URL 정확 중복은 DB 조회 1회로 즉시 반환** | 재수집이 파이프라인을 다시 타지 않음 |
| **문자 단위 근사 중복 비교** | 짧은 글에서도 안정적이고 교착어인 한국어에 맞는다. 알고리즘 세부와 파라미터는 문서에 적지 않는다 |
| `/analyze` 는 **브라우저에서만 계산**(AI 재검토 없음) | 서버 비용 0. 판정 엔진이 순수 TS 라 클라이언트에 그대로 번들됨 |
| Neon HTTP 드라이버 | 서버리스에서 커넥션 풀 불필요, 콜드스타트 최소 |
| 캡처는 Vercel Blob (선택) | 없어도 파이프라인은 돈다. 캡처는 수집기 로컬에 남음 |

## 데이터 이동과 공개 범위

화면(홈·`/analyze`)과 이 문서가 같은 말을 하도록 한 곳(`src/lib/copy.ts`)에서 정한다.

- **붙여넣은 문구**: 원문은 저장하지 않는다. 홈의 판독은 브라우저에서 먼저 계산하고, 일부 글은 보조 AI 가 다시 볼 수 있다. 이때 문구가 서버(`/api/analyze`)를 거쳐 Anthropic(미국, Claude Sonnet 5.5)으로 전송될 수 있다 — Vercel AI Gateway(미국) 경유, 공급자는 Anthropic 으로만 고정(`only`), 대체 모델 없음(Claude 장애면 규칙 판정만). 홈의 [AI 없이 확인]을 켜면 글·연락처·서명이 브라우저 밖으로 나가지 않는다. 고지 6항목(§28-8)은 화면 "자세히"에 있다(율 #compliance 1791950335). 그때의 AI 재검토 결과(판정과 체크리스트 항목 — 원문·자유 문장 없음)는 같은 문구의 재요청을 줄이려고 `llm_cache` 에 저장될 수 있다. `/analyze` 는 AI 를 쓰지 않고 브라우저 밖으로 아무것도 보내지 않는다.
- **입력 범위**: Threads 계정과 게시물·댓글·DM 문구뿐이다. 일반 웹사이트·다른 SNS 주소는 지원 범위 밖이며 화면이 그렇게 안내하고 멈춘다.
- **이미지**: 증빙 이미지 보조 검토는 *수집기가 가져온 캡처*에만 적용된다(글과 이미지 사이의 명백한 모순을 정황으로만 표시, 진위 판별이 아니며 단독 근거가 아님). 홈에서 붙여넣는 문구에는 이미지가 없다.
- **공개 조회는 합성 데모 계정만**: 고정 ID 목록(`src/lib/synthetic-accounts.ts`, `collector/fixtures` 와 같음 — 시험이 대조)의 계정만 누구에게나 조회·리포트·캠페인·집계에 나온다. 핸들 접두어로는 판정하지 않으며, 일반 수집이 예약된 ID 를 쓰면 거부한다(시드 업로드 `x-ingest-source: fixture` 만 허용). 실제로 수집한 계정은 `ADMIN_TOKEN`(Bearer 또는 `sr_admin` 쿠키)이 있어야 보이고, 공개 열람자에게는 "기록 없음"과 같은 응답이라 보유 여부도 드러나지 않는다. 공개 화면의 연락처는 가리고(010-****-1234), 다른 계정의 이름·핸들·링크는 수만 보인다. `noindex` 는 접근 제어가 아니라 보조 수단이다. 캡처 파일 주소는 핸들로 추측할 수 없게 무작위 접미어가 붙는다(`addRandomSuffix`).
- **검증**: `scripts/boundary-check.sh <BASE_URL> [실계정핸들] [ADMIN_TOKEN]` — 익명으로 합성 데모는 열리고 실계정은 안 열리는지, 리포트 JSON·인쇄 링크가 되는지 확인한다.

### 이용자 신고 · 위협 모델 (2026-10-14)

- 신고 수("이 계정을 조심하라는 신고 N건")는 **서로 다른 연결(IP HMAC) 3곳 이상 AND 지금 화면의 엔진 판정이 중간 이상**일 때만 보인다. 판정이 낮음으로 내려가면 다음 조회부터 바로 숨는다. 키당·밴드당 하루 20건, 6시간 10건 몰림 시 표시 보류.
- 판정 자격은 **조회 대상별**: 서버가 판정을 아는 대상(공개 합성 계정)은 서버 판정만 쓰고 요청의 `level` 은 무시한다. 키를 섞어 보내도 키마다 따로.
- **계정 키(`threads:*`, 글 속 @아이디 `handle:*`)는 요청의 판정으로 열 수 없다**: 공개 합성 계정은 서버(DB) 판정만, 실계정 키는 공개 조회에서 신고 수를 내지 않는다(관리자만). 붙여넣기 판정이 적용되는 것은 글 속 연락처·링크·서명뿐.
- **붙여넣기 판독은 원문이 서버로 가지 않으므로 서버가 등급을 증명할 수 없다.** 이 경로는 요청자가 보낸 `level` 을 받되 결과는 그 요청자의 응답에만 담고 저장·공유 링크·리포트에 남기지 않는다. API 를 직접 불러 HIGH 를 주장해도 얻는 것은 자기 화면의 "신고 N건(확인 안 됨)" 숫자뿐이고, 이 숫자는 정상 경로에서도 3곳·중간 이상이면 공개되는 정보라 추가 노출이 작다(테오 1791950099 판단, 카이 1791950858 수용). "요청자에게만"은 비밀 보장이 아님. API 응답은 누구나 받아 캡처할 수 있음. 저장·공유·리포트에 남지 않는다는 뜻. 그래서 숫자 자체를 서로 다른 연결 3곳 이상·"확인 안 됨" 표기로만 낸다.
- 원문은 받지 않는다(연락처·링크 키와 MinHash 서명만). 서명은 추측한 문구와 대조할 수 있어 완전 비식별은 아니다.
- AI 호출은 하루 `AI_DAILY_REQUEST_BUDGET`(기본 450) 회 상한을 *호출 전* 원자적 예약으로 지킨다(리뷰·이미지·요약 공통, DB 없으면 호출 안 함). 호출당 약 $0.0035 → 하루 최대 약 $1.6.
- 수집 토큰(`INGEST_TOKEN`)을 가진 쪽은 우리 수집기뿐이므로, 시드 표식(`x-ingest-source: fixture`)을 그 토큰의 요청 헤더로 정하는 것을 받아들인다(테오 1791950534). 토큰이 새면 공개 합성 목록을 오염시킬 수 있으므로 토큰은 비밀로 관리한다.

## 빠른 시작

```bash
cp .env.example .env        # POSTGRES_URL 만 있으면 시작 가능
npm i
npm run db:push             # 스키마 생성
npm run dev                 # http://localhost:3000
npm run seed                # 합성 샘플 20건(기본 12 + 연락처 공유 데모 8) 투입 → 조회·리포트 데모 가능
npm test                    # 엔진 단위 테스트
```

## Vercel 배포

1. GitHub 에 push → Vercel 에서 Import.
2. **Storage → Postgres(Neon) 생성** → `POSTGRES_URL` 자동 주입. **Storage → Blob 생성** → `BLOB_READ_WRITE_TOKEN` 자동 주입.
3. Environment Variables 에 `INGEST_TOKEN`·`ADMIN_TOKEN`(각각 아무 긴 문자열)을 설정한다. 보조 모델은 Vercel AI Gateway OIDC를 사용하므로 배포 환경에서 별도 공급자 키가 필요 없다. AI 재검토 모델은 기본 `anthropic/claude-sonnet-5.5`(Gateway 공급자 Anthropic 고정, 대체 모델 없음 — 실패하면 규칙 판정만)이며, 바꾸면 국외 이전 고지("자세히")도 같이 바꿔야 한다. 하루 호출 상한 `AI_DAILY_REQUEST_BUDGET`(기본 450, 호출을 시도하면 실패해도 1회로 셈). 신고 장부용 `COMMUNITY_SECRET` 은 필수.
   `ADMIN_TOKEN` 은 `/review` 검토 화면과 `/api/admin/*` 을 여는 열쇠다. **프로덕션에서 비워 두면 검토 API 가 잠긴다.**
4. 로컬에서 `POSTGRES_URL=<Neon URL> npm run db:push` 로 스키마 생성 (또는 `drizzle/0000_*.sql` 을 Neon SQL 콘솔에 붙여넣기).
5. 로컬 `.env` 의 `API_BASE=https://<your-app>.vercel.app`, `INGEST_TOKEN` 을 맞춘 뒤 `npm run seed` 또는 `npm run push`.

## 수집 (Aside)

1. Threads 수집 전용 계정을 만들어 Aside 브라우저에서 로그인한다. **본계정 금지.**
2. `collector/aside-task.md` 의 프롬프트에서 `{{KEYWORDS}}`(collector/keywords.txt), `{{OUT_DIR}}`(예: `collector/inbox/2026-09-19`), `{{MAX_ITEMS}}` 를 채워 `aside "…"` 로 실행. 권한은 **Read only**.
3. Aside 가 `<번호>.json` + `<번호>.png` + `<번호>.profile.png` 를 저장하면 `npm run push` → 서버로 전송, 처리된 파일은 `collector/done/` 으로 이동.
4. 수동 캡처도 같은 규약으로 `collector/inbox/` 에 넣으면 된다 (`collector/schema.ts` 참고).

Aside 의 루틴 기능으로 매일 같은 시간에 2번을 돌리고, cron 으로 `npm run push` 를 걸면 무인 운영이 된다.

## REST API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST` | `/api/ingest` | 수집기 → 게시물 1건 또는 배열(≤50). `Authorization: Bearer $INGEST_TOKEN` |
| `POST` | `/api/analyze` | 무상태 텍스트 판정 `{ text, account? }` → 점수·근거·정규화 결과 |
| `GET` | `/api/accounts/:q` | 계정 조회. `q` = `@handle` / `threads:handle` / 프로필·게시물 URL. 공개 열람은 합성 데모 계정만 |
| `GET` | `/api/reports/:accountId` | **조사용 리포트** — 계정명·일시·범죄사실요약·증거 캡처·계정 URL·프로필 캡처·판단 근거·신고처 |
| `GET` | `/api/clusters` | 캠페인(유사 문구 묶음) |
| `GET` | `/api/entities/:id` | 연락처 엔티티 1건(`telegram:vip_room` 형식) + 이 연락처를 쓴 계정·게시물 |
| `POST` | `/api/feedback` | 이용자 제보/이의. IP 당 **분당 10건** |
| `GET` | `/api/stats` | 집계 (`confirmed`/`cleared`/`queue` 포함) |
| `POST` | `/api/admin/login` | `{token}` → 맞으면 `sr_admin` httpOnly 쿠키 발급 |
| `POST` | `/api/admin/logout` | 쿠키 제거 |
| `GET` | `/api/admin/queue` | **검토 큐** — `?status=review\|high\|flagged\|all&limit=`. 계정별 상위 게시물 3건·연락처 수·연결 계정 수·열린 제보 수 |
| `POST` | `/api/admin/decision` | `{accountId, decision:"SCAM"\|"NOT_SCAM"\|"RESET", note?}` → 사람의 최종 판단 기록 |

관리자 API 는 `Authorization: Bearer $ADMIN_TOKEN` 또는 `sr_admin` 쿠키로 인증한다.
`ADMIN_TOKEN` 미설정 + 비프로덕션이면 통과시킨다(`checkIngestToken` 과 같은 규칙).

리포트 예시 (`/api/reports/threads:sample_vipstock77`):

```json
{
  "reportId": "SR-threads-sample_vipstock77-2026-09-18",
  "status": "HIGH", "score": 100,
  "account": { "handle": "sample_vipstock77", "url": "https://www.threads.net/@sample_vipstock77", "profileCapture": "https://…blob…/profile/threads_sample_vipstock77.png", "externalUrl": "https://t.me/vip_stock_room77", … },
  "timeline": { "firstSeen": "2026-09-10T02:11:00Z", "lastSeen": "2026-09-11T09:00:00Z", "postCount": 4, "distinctTargets": 3 },
  "summary": { "text": "1) 피신고 계정: … 5) 반복성: 무관한 여러 원글에 동일 댓글 살포, 동일·유사 문구 반복 게시", "generatedBy": "template" },
  "evidence": [ { "postUrl": "…/post/C1a", "parentUrl": "…/@randomuser_a/post/R1", "kind": "comment", "capture": "https://…/shots/post/….png", "text": "…", "techniques": ["chosung"], "clusterId": "c_696ca202b2dc" } ],
  "rationale": [ { "code": "term:텔레그램", "label": "텔레그램 유도 (초성 난독화)", "points": 22, "evidence": "ㅌㄹㄱㄹ" }, … ],
  "filing": [ { "name": "경찰청 사이버범죄 신고시스템 (ECRM)", "url": "https://ecrm.police.go.kr/minwon/main", … } ]
}
```

## 판정 엔진 (`src/engine`)

정규화 · 사전 · 점수 · 근사 중복 · 연락처 추출 · 설명 생성 모듈로 이루어진 순수 TypeScript 엔진이다(브라우저에서도 그대로 돈다). 어떤 규칙·가점·구간·기준값으로 판정하는지는 이 문서에 적지 않는다 — 판정 방식이 알려지면 그것을 피해 쓰는 글이 늘기 때문이다(소현 10-05). 화면에서는 신호의 *종류*와 사람이 읽을 설명(무엇이 잡혔는지 · 왜 신호인지 · 예시 · 정상 글은 어떻게 다른지)만 보여 준다.

## 연락처 엔티티 · 계정 간 연결 (`src/engine/entities.ts`)

문구는 쉽게 바꾸지만 **연락처는 못 바꾼다.** PIP 논문(arXiv 2404.07797)에서도 계정 묶음의 최고 정밀도 신호는
공유된 연락 수단이었다. 그래서 "텔레그램을 언급했다"가 아니라 **"어느 방으로 오라고 했는지"** 를 값으로 뽑아 저장한다.

- `extractEntities(text, {bio, externalUrl})` → `{type, value, raw, source}[]`.
  타입은 `telegram` / `kakao_open` / `kakao_channel` / `phone` / `line` / `wechat` (강한 신호) 와
  `handle` / `url` (약한 신호). 값은 소문자·`@`·프로토콜·후행 구두점을 제거해 정규화한다.
- 표기를 바꿔 쓴 연락처도 같은 값으로 모이도록 여러 형태로 훑는다(방식은 적지 않는다).
- `entities`(id = `type:value`) / `post_entities`(post↔entity, `account_id` 비정규화) 두 테이블에 쌓인다.
- 수집 시, **강한 타입**을 공유하는 다른 계정 수 N 을 세어 계정 근거에
  `shared-contact` — "다른 계정 N개와 동일 연락처 사용" 근거를 붙이고,
  계정 점수도 이 근거를 반영해 다시 매긴다.
  연결은 양방향이라 먼저 수집돼 있던 계정들도 같은 트랜잭션에서 계정당 UPDATE 1회로 다시 계산한다.
- 조회 화면에는 `연락처` 칩과 `같은 연락처를 쓰는 계정` 목록이, 리포트에는 `4. 유도 수단` 절과
  범죄사실요약 `4) 유도 수단` 줄에 실제 연락처와 연결 계정이 들어간다.

데모 픽스처: `collector/fixtures/entities-demo.json` (3개 계정이 `t.me/demo_room_alpha`, 2개 계정이
`open.kakao.com/o/demoKakao1` 를 공유). `npm run seed` (= `npx tsx collector/push.ts collector/fixtures`) 로 같이 들어간다.

```bash
curl -s localhost:3000/api/accounts/demo_lead_c | jq '.entities, .sharedWith'
curl -s localhost:3000/api/entities/telegram%3Ademo_room_alpha | jq '.entity.accountCount'
```

## 사람 검토 (`/review`)

이 제품의 약속은 **"최종 판단은 사람이 한다"** 이다. 룰 점수와 LLM 재판정은 *초안*이고, 계정에
낙인을 찍는 마지막 클릭은 사람이 누른다. 그 루프가 `/review` 다.

- **큐에 올라오는 것** — ① 기계가 `REVIEW`(애매한 구간)로 본 계정, ② `HIGH` 인데 아직
  사람이 안 본 계정, ③ 이용자가 `/api/feedback` 으로 이의·제보를 넣은 계정. 탭으로 나눠 본다.
- **판단** — `사기 확인`(SCAM) / `오탐`(NOT_SCAM) / `되돌리기`(RESET). 메모를 같이 남길 수 있다.
  판단은 `accounts.human_label / human_note / reviewed_at / reviewed_by` 에 저장되고, 그 계정의
  열린 제보(`feedback.status`)는 `resolved` 로 닫힌다.
- **기계 점수는 지우지 않는다.** 사람 판단은 점수를 덮어쓰는 게 아니라 *위에* 얹힌다. 나중에
  "기계가 높게 본 계정을 사람이 오탐으로 뒤집었다" 를 세어 판정 기준을 보정해야 하므로
  원래 판정이 남아 있어야 한다.
- **표시 라벨은 `src/lib/labels.ts` 한 곳에서 정한다.** `effectiveStatus(기계라벨, 사람라벨)` 이
  `SCAM → CONFIRMED`("검토 완료 · 사기 확인"), `NOT_SCAM → CLEARED`("검토 완료 · 해당 없음"), 그 외는
  기계 라벨을 그대로 돌려준다. 계정 API·조회 화면·리포트·집계가 모두 이 함수만 쓴다.
- **오탐으로 닫힌 계정의 리포트**는 맨 위에 "신고 근거로 사용하지 마십시오" 안내가 뜨고 점수 배지가
  회색으로 죽는다. 사람이 아니라고 한 계정의 리포트가 그대로 수사기관에 가면 안 되기 때문이다.

```bash
curl -s -XPOST localhost:3000/api/admin/login -H 'content-type: application/json' -d '{"token":"dev-admin"}' -c c.txt
curl -s -b c.txt "localhost:3000/api/admin/queue?status=review" | jq '.items[].accountId'
curl -s -b c.txt -XPOST localhost:3000/api/admin/decision -H 'content-type: application/json' \
  -d '{"accountId":"sample_normal_user3","decision":"NOT_SCAM","note":"일반 투자 후기, 유인 없음"}'
curl -s localhost:3000/api/accounts/sample_normal_user3 | jq '.effectiveStatus'   # → "CLEARED"
```

## 한계 · 다음 단계

- Threads DOM 구조는 자주 바뀐다 → 태스크 모드(자연어)를 기본으로 두고, REPL 스크립트는 예시만 둠.
- LLM 요약은 **초안**이다. 리포트에 "사람 검토 필요" 를 명시한다.
- Meta 에는 제3자 신고 API 가 없다. 플랫폼 신고는 수동, 정부 기관 제출은 ECRM 폼에 사람이 붙여넣는다.
- 오탐 보정: `/api/feedback` 으로 들어온 이의를 `/review` 에서 검토해 닫고, 뒤집힌 사례를 모아
  `lexicon.ts` 가중치를 조정한다. 사람 판단이 쌓이면 그대로 룰 엔진의 정답셋이 된다.
- 검토자는 아직 `ADMIN_TOKEN` 하나를 공유하는 단일 역할이다. 여러 검토자·감사 로그·2인 확인이 필요해지면
  `reviewed_by` 를 실제 계정으로 바꾸고 판단 이력을 별도 테이블로 뺀다.
- `/api/feedback` 레이트리밋은 프로세스 메모리 Map 이라 서버리스 인스턴스마다 따로 센다. 한 사람의
  연타를 막는 용도이고, 분산 공격을 막으려면 KV·Redis 가 필요하다.
