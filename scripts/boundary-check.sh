#!/usr/bin/env bash
# 공개 경계·데모 링크 점검 (Kai 훑기 1·2번의 "끝났다는 증거").
# 사용: scripts/boundary-check.sh <BASE_URL> [실계정핸들] [ADMIN_TOKEN]
#   BASE_URL      예) http://127.0.0.1:3187  또는 https://scam-radar-sooty.vercel.app
#   실계정핸들    공개로 열리면 안 되는 계정(합성 접두어 sample_/demo_/syn_ 가 아닌 핸들). 라이브에는 실계정이 없으므로 생략 가능 — 그 점검은 건너뜀
#   ADMIN_TOKEN   주면 관리자에게는 실계정이 열리는지도 확인
# 종료 코드: 모두 통과 0, 하나라도 실패 1.
set -u
BASE="${1:?BASE_URL 필요}"; REAL="${2:-}"; ADMIN="${3:-}"
SYN="${SYNTHETIC_HANDLE:-sample_vipstock77}"
fail=0
code() { curl -s -o /dev/null -w "%{http_code}" -m 30 "$@"; }
check() { # 설명 기대 실제
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; else echo "FAIL  $1 (기대 $2, 실제 $3)"; fail=1; fi
}
echo "== 공개(익명) — 합성 데모는 열린다"
check "계정 조회 $SYN" 200 "$(code "$BASE/api/accounts/$SYN")"
check "리포트 페이지 threads:$SYN" 200 "$(code "$BASE/report/threads:$SYN")"
check "리포트 JSON threads:$SYN" 200 "$(code "$BASE/api/reports/threads:$SYN")"
# 리포트 페이지의 JSON 링크와 인쇄 버튼이 실제로 동작하는 모양인가
HTML="$(curl -s -m 30 "$BASE/report/threads:$SYN")"
LINK="$(printf '%s' "$HTML" | grep -o 'href="/api/reports/[^"]*"' | head -1 | sed 's/href="//; s/"$//')"
[ -n "$LINK" ] && check "페이지의 JSON 링크 $LINK" 200 "$(code "$BASE$LINK")" || { echo "FAIL  페이지에 JSON 링크가 없음"; fail=1; }
case "$LINK" in *%25*) echo "FAIL  JSON 링크가 이중 인코딩됨 ($LINK)"; fail=1;; esac
if printf '%s' "$HTML" | grep -q 'javascript:'; then echo "FAIL  리포트 페이지에 javascript: 링크가 남아 있음"; fail=1; else echo "PASS  javascript: 링크 없음"; fi
printf '%s' "$HTML" | grep -q '인쇄/PDF' && echo "PASS  인쇄/PDF 버튼 있음" || { echo "FAIL  인쇄/PDF 버튼 없음"; fail=1; }
check "캠페인 페이지" 200 "$(code "$BASE/clusters")"
check "집계" 200 "$(code "$BASE/api/stats")"
if [ -n "$REAL" ]; then
  echo "== 공개(익명) — 실계정은 열리지 않는다 ($REAL)"
  check "계정 조회" 404 "$(code "$BASE/api/accounts/$REAL")"
  check "리포트 JSON" 404 "$(code "$BASE/api/reports/threads:$REAL")"
  check "리포트 페이지" 404 "$(code "$BASE/report/threads:$REAL")"
  if curl -s -m 30 "$BASE/clusters" | grep -qi "$REAL"; then echo "FAIL  /clusters 에 실계정 핸들이 보임"; fail=1; else echo "PASS  /clusters 에 실계정 없음"; fi
  if curl -s -m 30 "$BASE/api/clusters" | grep -qi "$REAL"; then echo "FAIL  /api/clusters 에 실계정 핸들이 보임"; fail=1; else echo "PASS  /api/clusters 에 실계정 없음"; fi
  if curl -s -m 30 "$BASE/api/accounts/$SYN" | grep -qi "$REAL"; then echo "FAIL  합성 계정 응답에 실계정이 섞임"; fail=1; else echo "PASS  합성 계정 응답에 실계정 없음"; fi
  for path in "/api/reports/threads:$SYN" "/report/threads:$SYN" "/api/entities/telegram:vip_stock_room77" "/api/stats" "/"; do
    if curl -s -m 30 "$BASE$path" | grep -qi "$REAL"; then echo "FAIL  $path 에 실계정 핸들이 보임"; fail=1; else echo "PASS  $path 에 실계정 없음"; fi
  done
  UNKNOWN="$(curl -s -m 30 "$BASE/api/accounts/zz_not_collected_$$" | python3 -c "import sys,json;d=json.load(sys.stdin);d.pop('query',None);print(json.dumps(d,sort_keys=True))")"
  REALBODY="$(curl -s -m 30 "$BASE/api/accounts/$REAL" | python3 -c "import sys,json;d=json.load(sys.stdin);d.pop('query',None);print(json.dumps(d,sort_keys=True))")"
  [ "$UNKNOWN" = "$REALBODY" ] && echo "PASS  실계정 응답 = 미수집 계정 응답(보유 여부가 드러나지 않음)" || { echo "FAIL  실계정 응답이 미수집 계정과 다름"; fail=1; }
  if [ -n "$ADMIN" ]; then
    echo "== 관리자 — 실계정이 열린다"
    check "계정 조회(Bearer)" 200 "$(code "$BASE/api/accounts/$REAL" -H "authorization: Bearer $ADMIN")"
    check "리포트 페이지(쿠키)" 200 "$(code "$BASE/report/threads:$REAL" -H "cookie: sr_admin=$ADMIN")"
    check "틀린 토큰은 막힘" 404 "$(code "$BASE/api/accounts/$REAL" -H "authorization: Bearer wrong-$$")"
  fi
fi
[ "$fail" = 0 ] && echo "ALL PASS" || echo "SOME FAILED"
exit "$fail"
