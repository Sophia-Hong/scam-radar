# 첫 실행 — 리딩방이 실제로 잡히는지 10분 안에 확인

서버·DB·Vercel 전부 필요 없습니다. Aside 로 수집 → 로컬 채점, 두 단계입니다.

## 0. 준비 (한 번만)

```bash
cd scam-radar && npm i
```

- Aside 브라우저 설치 후 **Threads 수집용 새 계정**으로 로그인 (본계정 금지)
- 터미널에서 `aside --update` 로 CLI 확인

## 1. 수집 — 아래 블록을 통째로 복사해 Aside 에 붙여넣기

`aside "…"` 로 실행하거나 Aside 앱의 태스크 입력창에 붙여넣습니다. 권한은 **Read only**.
`{{OUT_DIR}}` 는 이 레포의 절대경로로 바꾸세요 (예: `/Users/sophia/scam-radar/collector/inbox/first`).

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

## 2. 채점

```bash
npx tsx collector/score-local.ts collector/inbox/first
```

점수 순으로 계정·판정·근거·연락처가 표로 나오고, 같은 텔레그램/오픈채팅을 쓰는 계정 묶음이 아래 붙습니다.
`--all` 을 붙이면 LOW 도 보입니다. 결과는 `collector/inbox/first/scored.json` 에 저장됩니다.

## 3. 결과를 보면서 판단할 것

- **HIGH 인데 리딩방이 아닌 것** → 그 본문을 그대로 알려주세요. 사전을 고칩니다. (이게 제일 중요)
- **LOW 인데 명백히 리딩방인 것** → 마찬가지로 본문 공유.
- 연락처 묶음에 3개 이상 계정이 걸리면 그게 데모의 한 장면입니다.

수집이 잘 됐으면 그다음에 `npm run dev` + `npm run push` 로 사이트에 올립니다.
