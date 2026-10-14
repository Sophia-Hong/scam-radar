"""cases.json 점검 — 렌더 전에 한 번. 조건(율 #compliance 1791947826)이 하나라도 빠진 항목은 실패. python3 check_cases.py [id]"""
import hashlib, json, re, sys
from pathlib import Path
HERE = Path(__file__).parent
cases = json.loads((HERE / "cases" / "cases.json").read_text())
want = sys.argv[1] if len(sys.argv) > 1 else None
bad = 0
for c in cases:
    if want and c.get("id") != want:
        continue
    errs = []
    for k in ["id", "source_url", "original_file", "original_sha256", "redacted_file", "redacted_sha256", "date", "kogl", "credit_ko", "credit_en", "redactions", "yul_ok"]:
        if not c.get(k):
            errs.append(f"{k} 없음")
    if c.get("kogl") != 1:
        errs.append("공공누리 제1유형 아님")
    if c.get("source_url") and not re.match(r"https://([a-z0-9-]+\.)*(police\.go\.kr|fss\.or\.kr|korea\.kr|ecrm\.police\.go\.kr|fsc\.go\.kr)/", c["source_url"]):
        errs.append("기관 원자료 도메인 아님(언론 금지)")
    if c.get("credit_ko") and not re.fullmatch(r"출처: \S.* 보도자료 \(\d{4}-\d{2}-\d{2}\)", c["credit_ko"]):
        errs.append('표기 형식 "출처: ○○ 보도자료 (YYYY-MM-DD)" 아님')
    for f, h in [("original_file", "original_sha256"), ("redacted_file", "redacted_sha256")]:
        p = HERE / c.get(f, "")
        if not c.get(f) or not p.is_file():
            errs.append(f"{f} 파일 없음")
        elif hashlib.sha256(p.read_bytes()).hexdigest() != c.get(h):
            errs.append(f"{h} 불일치")
    print(("OK  " if not errs else "BAD ") + str(c.get("id")) + ("" if not errs else " — " + "; ".join(errs)))
    bad += bool(errs)
if want and not any(c.get("id") == want for c in cases):
    print(f"BAD {want} — cases.json 에 없음"); bad += 1
sys.exit(1 if bad else 0)
