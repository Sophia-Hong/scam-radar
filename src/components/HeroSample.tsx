/**
 * 홈 첫 화면의 예시 — 합성(가짜) 게시물 카드 두 장. 실제 계정·실제 인물 사진·실제 캡처를 쓰지 않는다 (Kai 훑기 1번: 합성 데모만 공개).
 * 이전에는 실제 Threads 캡처(핸들·얼굴 노출)가 있었다.
 */
export function HeroSample() {
  return (
    <div className="analyzer-evidence" aria-label="합성 예시: 기관 재직을 내세우며 연락을 유도하는 게시물의 구조를 흉내 낸 가짜 카드">
      <figure className="analyzer-evidence-card evidence-dark synthetic-card">
        <div className="synthetic-post">
          <div className="synthetic-head"><i aria-hidden="true" /><b>sample_hr_lab</b><span>8m</span></div>
          <p>○○증권 재직 중입니다. 사원증 인증 사진 올려요.</p>
          <div className="synthetic-badge" aria-hidden="true"><span>사원증 이미지 자리</span></div>
          <div className="synthetic-foot">종목 정보 필요하신 분 댓글 남겨주세요</div>
        </div>
      </figure>
      <figure className="analyzer-evidence-card evidence-light synthetic-card">
        <div className="synthetic-post">
          <div className="synthetic-head"><i aria-hidden="true" /><b>sample_hr_lab2</b><span>3h</span></div>
          <p>○○증권 재직 중입니다. 사원증 인증 사진 올려요.</p>
          <div className="synthetic-badge" aria-hidden="true"><span>사원증 이미지 자리</span></div>
          <div className="synthetic-foot">프로필 링크로 오세요 · 같은 문장이 다른 계정에도</div>
        </div>
      </figure>
      <div className="analyzer-evidence-note"><b>합성 예시</b><span>구조만 흉내 낸 가짜 카드 · 실제 계정 아님</span></div>
    </div>
  );
}
