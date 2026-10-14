#!/bin/zsh
# 30분 주기 수집 → 채점 → 서버 등록.  launchd: collector/com.scamradar.collect.plist
# 전제: 이 머신에 Aside 브라우저가 Threads 수집용 계정으로 로그인돼 있고, .env 에 API_BASE·INGEST_TOKEN 이 있다.
set -u
cd "$(dirname "$0")/.." || exit 1

# ── 폴라잇 크롤 가드 (2026-10-14, 소현 "폴라잇 크롤 강제해 내 계정이 날아갈 거 같아") ──
# 1) 소현 O 없이는 안 돈다: ~/.config/scam-radar/collect-approved-until 에 미래 epoch 가 있어야 함.
# 2) 하루 최대 4회, 실행 간 최소 2시간, 검색 사이 20초.
# 3) 검색마다 BLOCKED(429·잠시 후 다시·로그인 벽·챌린지) 또는 0건 2연속이면 그 자리에서 중단, 다음날 09시(KST)까지 정지.
GUARD_DIR="$HOME/.config/scam-radar"; mkdir -p "$GUARD_DIR" logs; touch logs/collect.log
APPROVED_UNTIL=$(cat "$GUARD_DIR/collect-approved-until" 2>/dev/null || echo 0)
NOW=$(date +%s)
if (( NOW >= APPROVED_UNTIL )); then echo "[$(date '+%F %T')] guard: 소현 O 없음 — 수집 안 함" >> logs/collect.log; exit 0; fi
STOP_UNTIL=$(cat "$GUARD_DIR/collect-blocked-until" 2>/dev/null || echo 0)
if (( NOW < STOP_UNTIL )); then echo "[$(date '+%F %T')] guard: 차단 감지 후 정지 중" >> logs/collect.log; exit 0; fi
TODAY=$(TZ=Asia/Seoul date +%F); RUNS="$GUARD_DIR/collect-runs-$TODAY"
COUNT=0; LAST=0
if [[ -f "$RUNS" ]]; then COUNT=$(wc -l < "$RUNS" | tr -d ' '); LAST=$(tail -1 "$RUNS"); fi
if (( COUNT >= 4 )) || (( NOW - LAST < 7200 )); then echo "[$(date '+%F %T')] guard: 하루 4회/2시간 간격 초과" >> logs/collect.log; exit 0; fi
echo "$NOW" >> "$RUNS"
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/local/bin:$PATH"
BATCH="collector/inbox/$(date +%Y%m%d-%H%M)"
mkdir -p "$BATCH" logs
RAW="$BATCH/raw.jsonl"; : > "$RAW"
LOG="logs/collect.log"
echo "[$(date '+%F %T')] start $BATCH" >> "$LOG"

block_stop() {  # 차단 신호 → 즉시 중단, 다음날 09시(KST)까지 정지
  TZ=Asia/Seoul date -v+1d -v9H -v0M -v0S +%s > "$GUARD_DIR/collect-blocked-until"
  echo "[$(date '+%F %T')] guard: $1 — 즉시 중단, 다음날 09시까지 정지" >> "$LOG"
  rm -f "$BATCH/.cur.js"; exit 2
}
ZERO_STREAK=0
while IFS= read -r kw; do
  [[ -z "$kw" || "$kw" == \#* ]] && continue
  for mode in recent default; do
    sed -e "s|__KW__|$kw|" -e "s|__MODE__|$mode|" collector/aside-collect.js > "$BATCH/.cur.js"
    OUT=$(aside repl "$(cat "$BATCH/.cur.js")" 2>>"$LOG")
    print -r -- "$OUT" | grep -E '^(ITEM|DONE)' | sed 's/^ITEM //' >> "$RAW"
    B=$(print -r -- "$OUT" | grep -m1 '^BLOCKED' || true)
    [[ -n "$B" ]] && block_stop "$B ($kw/$mode)"
    N=$(print -r -- "$OUT" | grep -m1 '^DONE' | awk '{print $NF}')
    if [[ -z "$N" || "$N" == 0 ]]; then ZERO_STREAK=$((ZERO_STREAK+1)); else ZERO_STREAK=0; fi
    (( ZERO_STREAK >= 2 )) && block_stop "결과 0건(또는 DONE 없음) 2번 연속 ($kw/$mode)"
    sleep 20   # 검색 사이 간격
  done
done < collector/keywords.txt
rm -f "$BATCH/.cur.js"

# raw.jsonl → 스키마 JSON 배열 (본문 8자 미만·중복 URL 제외)
node -e '
const fs=require("fs");const raw=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(l=>l.startsWith("{")).map(l=>JSON.parse(l));
const by=new Map();for(const it of raw){if(!by.has(it.postUrl)&&it.text&&it.text.trim().length>=8)by.set(it.postUrl,it);}
const out=[...by.values()].map(it=>({platform:"threads",postUrl:it.postUrl,parentUrl:null,kind:"post",text:it.text,postedAt:it.postedAt||null,
 author:{handle:it.handle,displayName:null,profileUrl:"https://www.threads.net/@"+it.handle,bio:null,externalUrl:(it.links||[null])[0]||null,followers:null,following:null,postCount:null}}));
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,1));console.log("items",out.length);
' "$RAW" "$BATCH/batch.json" >> "$LOG" 2>&1

npx tsx collector/score-local.ts "$BATCH/batch.json" >> "$LOG" 2>&1
npx tsx collector/push.ts "$BATCH/batch.json" >> "$LOG" 2>&1
echo "[$(date '+%F %T')] done $BATCH" >> "$LOG"
