/**
 * 공개 경계 — 누구에게나 열리는 조회에는 **합성 데모 계정만** 나온다 (Kai 훑기 1번, 테오 10-05).
 * 실제로 수집한 계정의 리포트·원문·연결 정보는 관리자(ADMIN_TOKEN 쿠키/Bearer)만 본다. `noindex` 는 접근 제어가 아니다.
 *
 * 합성 계정 = 핸들이 `sample_` · `demo_` · `syn_` 로 시작하는 것(시드 `collector/fixtures`, 평가셋).
 * 한계: 실제 Threads 계정이 우연히 이 접두어로 시작하면 공개로 취급된다. 실수집 자료에는 이 접두어를 쓰지 않는다는 규약(README)에 기대며
 * 코드는 이를 강제하지 않는다. 열람자에게는 "없음"과 "공개 불가"가 같은 응답이라 실계정의 보유 여부도 드러나지 않는다.
 */
export const SYNTHETIC_HANDLE_RE = /^(?:sample|demo|syn)_/i;
/** 계정 id(`platform:handle`) 쪽 같은 규칙 — SQL(`~*`)과 JS 가 같은 모양을 쓴다 */
export const SYNTHETIC_ID_SQL = "^[a-z]+:(sample|demo|syn)_";

export function isSyntheticHandle(handle: string | null | undefined): boolean {
  return !!handle && SYNTHETIC_HANDLE_RE.test(handle.replace(/^@/, ""));
}

export function isSyntheticAccountId(id: string | null | undefined): boolean {
  if (!id) return false;
  const i = id.indexOf(":");
  return i > 0 && isSyntheticHandle(id.slice(i + 1));
}

/** 이 열람자가 이 계정을 볼 수 있는가: 합성이거나 관리자 */
export function canView(handleOrId: string, admin: boolean): boolean {
  if (admin) return true;
  return handleOrId.includes(":") ? isSyntheticAccountId(handleOrId) : isSyntheticHandle(handleOrId);
}

/** 공개 응답에서 실계정 항목을 걸러낸다 (관리자는 그대로) */
export function onlyVisible<T>(items: T[], idOf: (t: T) => string, admin: boolean): T[] {
  return admin ? items : items.filter((t) => canView(idOf(t), false));
}

/**
 * 저장된 근거 중 `shared-contact` 는 "같은 연락처를 쓰는 다른 계정"의 id 를 근거 문장에 적어 둔다 (예: `텔레그램 x → threads:a, threads:b`).
 * 공개 열람자에게는 공개 범위 밖(실계정) id 와 그 개수를 걸러서 보여준다. 관리자에게는 호출하지 않는다.
 */
export function redactSharedContact<T extends { code: string; label: string; evidence?: string | null }>(reasons: T[]): T[] {
  return reasons.map((r) => {
    if (r.code !== "shared-contact" || !r.evidence) return r;
    const i = r.evidence.indexOf("→");
    if (i < 0) return r;
    const head = r.evidence.slice(0, i).trim();
    const ids = r.evidence.slice(i + 1).split(",").map((s) => s.trim()).filter(Boolean);
    const visible = ids.filter((id) => isSyntheticAccountId(id));
    if (visible.length === ids.length) return r;
    if (visible.length === 0) return { ...r, label: "공개 범위 밖 계정과 동일 연락처 사용", evidence: head };
    return { ...r, label: `다른 계정 ${visible.length}개와 동일 연락처 사용`, evidence: `${head} → ${visible.join(", ")}` };
  });
}

/** 리포트·계정 JSON 의 링크용 id — 이미 디코딩된 id 를 한 번만 인코딩한다 (이중 인코딩 `%253A` 방지) */
export function reportApiHref(accountId: string): string {
  return `/api/reports/${encodeURIComponent(accountId)}`;
}

/** 경로 파라미터 디코딩 — 이미 디코딩돼 있거나 `%253A` 처럼 두 번 인코딩돼 와도 같은 id 로 돌려준다 */
export function decodeParam(raw: string): string {
  let s = raw;
  for (let i = 0; i < 2; i++) {
    try {
      const d = decodeURIComponent(s);
      if (d === s) break;
      s = d;
    } catch {
      break;
    }
  }
  return s.trim();
}
