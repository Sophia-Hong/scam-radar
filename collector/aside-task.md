# Aside 브라우저 태스크 프롬프트 (Threads 수집)

`aside` 에 아래 프롬프트를 그대로 붙여 넣는다. 권한은 **Read only** 로 두면 게시·메시지 위험이 없다.
Threads 계정은 수집 전용으로 하나 새로 만들어 로그인해 둔다 (본계정 사용 금지).

---

Threads(https://www.threads.net)에서 다음 검색어를 하나씩 검색해라: {{KEYWORDS}}

각 검색어에 대해 "최신" 탭으로 전환하고 결과를 최대 30개까지 스크롤하면서, 게시물 본문에
(a) 텔레그램/카톡/오픈채팅/DM/프로필 링크 등 외부 연락 유도 와 (b) 주식·코인·수익·리딩 언급이
**둘 다** 있는 게시물만 골라라. 초성(ㅌㄹㄱㄹ), 특수문자 삽입(텔.레.그.램), 외국 문자(Ｔеlеgrаm) 같은
변형도 같은 것으로 본다. 판단이 애매하면 포함시켜라 — 최종 판정은 서버가 한다.

고른 게시물마다:
1. 게시물을 열고 전체 화면 스크린샷을 `{{OUT_DIR}}/<번호>.png` 로 저장
2. 작성자 프로필을 열어 스크린샷을 `{{OUT_DIR}}/<번호>.profile.png` 로 저장하고, 소개글·외부 링크·팔로워·팔로잉 수를 읽어라
3. 프로필 메뉴의 `프로필 정보`/`About this profile`에 **가입 국가가 실제로 표시될 때만** 그 값을 기록한다. 언어·이름으로 국적을 추정하지 마라
4. 게시물의 댓글 중 같은 조건을 만족하는 댓글이 있으면 그 댓글도 별도 항목으로 기록 (kind: "comment", parentUrl: 원글 URL)
5. 아래 JSON 을 `{{OUT_DIR}}/<번호>.json` 으로 저장

```json
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
    "following": 456,
    "postCount": null,
    "createdAt": null,
    "profileCountry": "가입 국가 표시값 또는 null",
    "countrySource": "가입 국가를 직접 확인했으면 threads_about_profile, 아니면 null"
  }
}
```

주의: 어떤 게시물에도 좋아요·댓글·팔로우·DM 을 하지 마라. 읽기만 해라.
같은 URL 을 두 번 저장하지 마라. 검색어 하나당 최대 30개, 전체 최대 {{MAX_ITEMS}}개에서 멈춰라.
마지막에 저장한 파일 수를 보고해라.
