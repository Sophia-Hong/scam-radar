/**
 * 수집기 → 서버 공통 스키마. Aside 가 저장하는 JSON 도 이 형태를 따른다.
 * 파일 규약: collector/inbox/<배치명>/<아무이름>.json  (+ 같은 이름의 .png/.jpg 가 있으면 캡처로 첨부)
 *            프로필 캡처는 <아무이름>.profile.png
 */
export interface CollectedItem {
  platform?: "threads" | "instagram" | "x" | "youtube" | "naver" | "other";
  postUrl: string;
  parentUrl?: string | null;   // 댓글이면 원글 URL
  kind?: "post" | "comment";
  text: string;
  postedAt?: string | null;    // ISO 8601, 화면에 보이는 값을 최대한 그대로
  capturedAt?: string;         // 없으면 push 시각
  screenshot?: string | null;  // 파일명(상대) 또는 data URL. 없으면 같은 이름의 .png 탐색
  author: {
    handle: string;
    displayName?: string | null;
    profileUrl: string;
    bio?: string | null;
    externalUrl?: string | null;
    followers?: number | null;
    following?: number | null;
    postCount?: number | null;
    createdAt?: string | null;
    /** Threads '프로필 정보'에 표시된 국가. 추정값을 넣지 않는다. */
    profileCountry?: string | null;
    countrySource?: "threads_about_profile" | "manual" | null;
    profileScreenshot?: string | null;
  };
}
