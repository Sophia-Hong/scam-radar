# HANDOVER — 리딩방 레이더 첫 실전 수집 (맥미니 · Aside)

> 이 문서는 **맥미니에서 작업하는 AI 에이전트(Claude Code 등)** 에게 주는 작업 지시서다.
> 목표는 하나: **Threads 에서 실제 리딩방 유인 게시물을 수집해 채점기에 넣고, 결과표를 보고서로 남기는 것.**
> 서버·DB·Vercel 은 이번 작업에 필요 없다. 코드를 고치지 말고, 정해진 명령만 실행하라.

---

## 0. 전제 조건 (시작 전에 확인)

| 항목 | 확인 방법 | 안 되면 |
|---|---|---|
| Node 20+ | `node -v` | `brew install node` |
| Aside CLI | `aside --update` 가 응답 | https://aside.com 설치 후 새 터미널 |
| Aside 에 Threads 로그인 | Aside 앱에서 https://www.threads.net 열어 피드가 보이는지 | **수집 전용 계정**으로 로그인. 본계정 절대 금지 |
| Aside 계정 | `aside account status` | 여러 계정이면 `aside account use <id>` |

---

## 1. 설치 (2분)

```bash
cd ~/Projects            # 아무 작업 폴더
unzip ~/Downloads/scam-radar.zip   # 또는 git clone <레포 URL>
cd scam-radar
npm i
npm test                 # 54 passed 가 나와야 정상
npm run eval             # "PASS" 가 마지막 줄에 나와야 정상
```

둘 다 통과하면 엔진은 정상이다. 실패하면 여기서 멈추고 출력 전체를 보고하라.

---

## 2. 수집 (Aside, 10~20분)

### 2-1. 출력 폴더 만들기

```bash
mkdir -p "$(pwd)/collector/inbox/first"
echo "$(pwd)/collector/inbox/first"     # 이 절대경로를 아래 프롬프트의 {{OUT_DIR}} 자리에 넣는다
```

### 2-2. Aside 태스크 실행

아래 프롬프트에서 `{{OUT_DIR}}` 세 군데를 위 절대경로로 바꾼 뒤, **그대로** Aside 에 넣는다.
CLI 라면 `aside "<프롬프트 전체>"`, 앱이라면 태스크 입력창에 붙여넣기. 권한 수준은 **Read only** 로 둔다.

```
Threads(https://www.threads.net)에서 다음 검색어를 하나씩 검색해라:
리딩방, 무료 리딩, 급등주 추천, 종목 추천 텔레, 수익인증 텔레그램, ㅌㄹㄱㄹ, 오픈채팅 주식, 코인 리딩, 원금보장, 물린 종목 복구

각 검색어에 대해 "최신" 탭으로 전환하고 결과를 최대 20개까지 스크롤하면서, 게시물 본문에
(a) 텔레그램/카톡/오픈채팅/DM/프로필 링크 등 외부 연락 유도 와 (b) 주식·코인·수익·리딩 언급이
둘 다 있는 게시물만 골라라. 초성(ㅌㄹㄱㄹ), 특수문자 삽입(텔.레.그.램), 외국 문자(Ｔеlеgrаm) 같은
변형도 같은 것으로 본다. 판단이 애매하면 포함시켜라 — 최종 판정은 프로그램이 한다.

고른 게시물마다:
1. 게시물을 열고 전체 화면 스크린샷을 {{OUT_DIR}}/<번호>.png 로 저장
2. 작성자 프로필을 열어 스크린샷을 {{OUT_DIR}}/<번호>.profile.png 로 저장하고, 소개글·외부 링크·팔로워 수를 읽어라
3. 게시물의 댓글 중 같은 조건을 만족하는 댓글이 있으면 그 댓글도 별도 항목으로 기록 (kind: "comment", parentUrl: 원글 URL)
4. 아래 JSON 을 {{OUT_DIR}}/<번호>.json 으로 저장

{
  "platform": "threads",
  "postUrl": "게시물 고유 URL (https://www.threads.net/@handle/post/xxxx)",
  "parentUrl": null,
  "kind": "post",
  "text": "본문 전체를 한 글자도 바꾸지 말고 그대로 (이모지·특수문자 포함)",
  "postedAt": "게시 시각 ISO 8601, 모르면 null",
  "author": {
    "handle": "handle (@ 없이)",
    "displayName": "표시 이름",
    "profileUrl": "https://www.threads.net/@handle",
    "bio": "프로필 소개 전체",
    "externalUrl": "프로필 외부 링크 또는 null",
    "followers": 123,
    "following": null,
    "postCount": null
  }
}

주의: 어떤 게시물에도 좋아요·댓글·팔로우·DM 을 하지 마라. 읽기만 해라.
같은 URL 을 두 번 저장하지 마라. 전체 최대 60개에서 멈춰라.
마지막에 저장한 파일 수를 보고해라.
```

### 2-3. 수집 결과 확인

```bash
ls collector/inbox/first | head
ls collector/inbox/first/*.json | wc -l      # 10개 이상이면 채점으로 진행
```

**JSON 이 0개면** Aside 가 파일 저장을 못 한 것이다. 이 경우:
- Aside 가 결과를 화면에만 출력했다면, 그 출력(JSON 배열)을 통째로 `collector/inbox/first/batch.json` 으로 저장하라. 배열도 그대로 읽힌다.
- 스크린샷은 없어도 채점은 된다. 본문·핸들·URL 만 있으면 충분하다.

---

## 3. 채점 (10초)

```bash
npx tsx collector/score-local.ts collector/inbox/first --all
```

출력 예:

```
점수  판정    계정                  글  살포 본문
100   HIGH    @xxxx                 4   3    급등주 종목 무료로 … ㅌㄹㄱㄹ @vip_room
      +22 프로필 링크 유도 · +22 텔레그램 유도 (초성 난독화) · +15 결합 · +14 급등주
      연락처: telegram:vip_room
 58   REVIEW  @yyyy                 1   0    …
 12   LOW     @zzzz                 1   0    …

HIGH 7 · REVIEW 3 · LOW 5

같은 연락처를 쓰는 계정 묶음:
  telegram:vip_room  ←  @xxxx, @aaaa, @bbbb

저장: collector/inbox/first/scored.json
```

---

## 4. 보고서 작성 — 이 형식 그대로

`collector/inbox/first/REPORT.md` 를 만들고 아래를 채워라. **판단하지 말고 관찰만 적어라.**

```markdown
# 첫 실전 수집 결과 — <날짜>

## 수집
- 검색어 10개 중 결과가 나온 검색어: …
- 저장된 게시물 수: N (게시물 A / 댓글 B)
- 스크린샷 저장 여부: 예/아니오
- Aside 가 막히거나 실패한 지점: (없으면 "없음")

## 채점 요약
- HIGH N · REVIEW N · LOW N
- 같은 연락처 묶음: N개 (가장 큰 묶음: telegram:xxx ← 계정 M개)

## HIGH 전체 목록 (점수, 핸들, 본문 첫 90자)
1. 100 @… "…"
2. …

## 사람이 보기에 이상한 것 ← 제일 중요
### HIGH 인데 리딩방 유인글이 아닌 것 같은 항목
- @핸들 / 점수 / 본문 전체 / 왜 아닌 것 같은지 한 줄

### LOW 또는 REVIEW 인데 명백히 리딩방 유인글인 항목
- @핸들 / 점수 / 본문 전체

### 채점기가 못 잡은 패턴 (연락처가 이미지에만 있음, 새로운 은어, 사칭 등)
- …

## 첨부
- scored.json
- 위 "이상한 것" 항목의 스크린샷 파일명
```

보고서와 `scored.json`, 이상 항목의 png 를 함께 전달하라.

---

## 5. 하지 말 것

- `src/` 아래 코드를 수정하지 마라. 채점이 이상해도 **기록만** 하라. 사전(lexicon) 수정은 원 작성자가 보고서를 보고 한다.
- Threads 에서 좋아요·팔로우·댓글·DM 등 **어떤 쓰기 행동도** 하지 마라.
- 수집 계정을 본계정으로 바꾸지 마라.
- `npm run push`, `npm run seed`, Vercel 배포는 이번 작업 범위 밖이다. 하지 마라.
- 수집된 JSON 을 외부에 올리지 마라. 실명·실계정 정보가 들어 있다.

---

## 6. 막혔을 때

| 증상 | 조치 |
|---|---|
| `aside` 명령 없음 | 새 터미널을 열거나 `curl -fsSL https://releases.aside.com/install.sh \| bash` |
| Aside 가 Threads 로그인 화면을 띄움 | Aside 앱에서 수집 계정으로 로그인 후 재실행 |
| 검색 결과가 비어 있음 | 검색어를 "리딩방 텔레" 처럼 2단어로 바꿔 재시도. "최신" 탭 대신 "인기" 도 시도 |
| `npm test` 실패 | Node 버전 확인 (`node -v` 가 20 이상). 출력 전체를 보고 |
| `score-local.ts` 가 "JSON 없음" | 경로 오타. `ls collector/inbox/first` 로 파일 위치 확인 |
| JSON 파싱 에러 | 해당 파일을 열어 따옴표·쉼표 확인. 문제 파일은 이름 뒤에 `.bad` 를 붙여 빼고 재실행 |

---

## 부록 — 이 프로젝트가 뭔지 (30초 설명)

SNS 게시물에서 "텔레그램/오픈채팅으로 오라"고 유인하는 주식·코인 리딩방 계정을 찾아내는 도구다.
Aside 는 화면에서 **{URL, 작성자, 본문, 캡처}만 뽑고**, 판정은 코드(`src/engine`)가 한다.
초성(ㅌㄹㄱㄹ)·혼동문자(Ｔеlеgrаm)·제로폭 문자 같은 난독화를 되돌린 뒤 어휘 규칙으로 점수를 매기고,
같은 텔레그램 주소를 쓰는 계정들을 묶는다. 70점 이상 HIGH, 40~69 REVIEW, 미만 LOW.
합성 평가셋 269건에서 HIGH 정밀도 1.000 이지만 **실제 데이터로는 아직 한 번도 안 돌렸다** — 그게 이번 작업이다.
