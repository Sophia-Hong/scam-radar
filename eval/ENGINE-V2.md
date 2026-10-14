# Engine v2 validation notes

This change improves text-only detection of investment and received-message scams. It does not inspect images or crawl social networks.

## What changed

- Spaced English letters and separators are restored only for runs of isolated letters. This catches deliberately broken contact and guarantee words without joining normal prose.
- Indirect conversion offers are recognized when an investment list or trading material is offered through a profile button or a comment reply. The conversion cue must still combine with investment or profit evidence for an automatic high result.
- Warning, quotation, and explicit-negation context is removed only from its local clause or attributed quote. A later independent offer remains visible.
- Received-message patterns now cover secrecy demands, pre-withdrawal payment, trading/remote-control installation, VIP-room profit proof, romance investment pressure, task/review work, advance payment, fake recruiting, urgency, and institutional impersonation. One family alone is not enough; automatic HIGH requires a payment demand plus another independent family.
- A promise of principal protection, loss compensation, or fixed/guaranteed investment returns is an automatic HIGH signal. The same wording remains dampened when it is locally negated, quoted as a warning, or explicitly presented as illegal.

## Tests and corpus checks

Engine unit tests cover each tactic with newly written Korean and English examples, including benign counterexamples. They do not copy the REDTEAM sentences.

`eval/corpus.jsonl` is evaluated at its pinned `2026-09-20` reference time. The comparison below is from the saved partial baseline `a437e4e` to this working tree.

| Metric | Baseline | Current |
| --- | ---: | ---: |
| HIGH precision | 1.000 (134/134) | 1.000 (135/135) |
| Scam recall | 0.843 (134/159) | 0.849 (135/159) |
| Benign HIGH | 0 | 0 |

The REDTEAM markdown in `.ref/redteam-v1.md` reports 30 Korean and 30 English cases, but this worktree contains only its aggregate table and a few prose summaries. The source sentence files named by that document (`../work/gasa-redteam-20261014/cases-ko.json` and `cases-en.json`) are not present. Therefore `eval/dev-redteam-v1.jsonl` cannot be truthfully transcribed or run here; the DEV runner (`scripts/eval-dev.ts`) is ready to run it once those texts are supplied. Fabricating substitute rows would make its before/after counts misleading.

`.ref/real-examples.jsonl` was absent at validation time, so the optional additional DEV check did not run.

## Known limits

- Image-only text remains outside this engine's view.
- Clause-local context detection is intentionally conservative. Unusual quotation styles or long, ambiguous sentences may need REVIEW or human review.
- The engine assesses text evidence, not the truth of account identity, screenshots, or investment claims.
- The corpus is a regression gate, not a claim of real-world prevalence or recall.

## Round 2 — received SMS and messenger messages

This round adds a separate, conservative path for messages that a person pastes
before replying or sending money. It does not make a link, a greeting, or a
single keyword a HIGH result. A HIGH result needs a recognizable lure, a real
action request (for example a suspicious link, callback, app install, payment,
or credential request), and separate supporting pressure, impersonation, or
payment evidence. Partial cases stay in REVIEW for the checklist reviewer.

- Delivery and parcel messages now recognize delivery trouble, address changes,
  customs/payment language, and tracking directions when they point to an odd
  or shortened destination. Known courier hosts such as `cjlogistics.com` and
  `ups.com` are not treated as suspicious links.
- Official-impersonation messages now cover police, courts, tax, financial,
  health-insurance, civil-complaint, traffic, and account-lock notices when
  they also ask the recipient to act. Official `.go.kr` links alone do not
  produce HIGH.
- Family-number-change messages are covered only when they go on to ask for
  money, gift cards, identity/card material, an install, or another concrete
  action. Ordinary family chat remains below HIGH.
- Task/recruiting messages cover review/rating work, unusually easy or paid
  tasks, and recruiter language when paired with a risky action. Ordinary job
  listings without that combination remain below HIGH.
- Romance remains conservative: a greeting or affection alone is not HIGH.
  It needs an investment or transfer pivot and the same received-message
  combination evidence.

### DEV evidence (not a release benchmark)

The supplied 84 public-warning examples were measured with the committed
Round-1 engine (`2afcf2b`) and this working tree. Counts are `HIGH / REVIEW /
LOW`; a source example may be incomplete or have its URL redacted, so these
numbers are not a recall claim.

| Family / language | Before | After |
| --- | ---: | ---: |
| Delivery/parcel — English (12) | 0 / 0 / 12 | 4 / 0 / 8 |
| Delivery/parcel — Korean (16) | 0 / 0 / 16 | 5 / 0 / 11 |
| Institution impersonation — English (9) | 0 / 0 / 9 | 0 / 0 / 9 |
| Institution impersonation — Korean (21) | 0 / 0 / 21 | 7 / 2 / 12 |
| Family impersonation — Korean (6) | 0 / 0 / 6 | 3 / 0 / 3 |
| Side job/task — English (6) | 1 / 0 / 5 | 1 / 0 / 5 |
| Side job/task — Korean (2) | 0 / 0 / 2 | 0 / 1 / 1 |
| Romance-investment — English (3) | 0 / 0 / 3 | 0 / 0 / 3 |
| Romance-investment — Korean (1) | 0 / 0 / 1 | 0 / 0 / 1 |
| Other supplied examples — Korean (3) | 0 / 0 / 3 | 0 / 0 / 3 |
| Fake-loan app — Korean (1) | 0 / 0 / 1 | 0 / 0 / 1 |
| Investment/trading-app/withdrawal — Korean (4) | 0 / 0 / 4 | 0 / 0 / 4 |
| **All supplied examples (84)** | **1 / 0 / 83** | **20 / 3 / 61** |

`eval/dev-redteam-v1.jsonl` was transcribed exactly from the supplied Korean
and English case files. It has two intentionally text-empty lure rows, which
the DEV runner reports as missing rather than scoring. On its 58 scorable rows,
the investment-post red team is unchanged: lure LOW misses are **14 → 14**,
lures that are not HIGH are **18 → 18**, and benign HIGH results are **3 → 3**.

The pinned regression corpus remains at HIGH precision **1.000 (135/135)**,
with zero benign HIGH results and scam recall **0.849**.

### Remaining limits

- Many real-warning samples are deliberately short, redacted, or contain only
  a generic `<URL>` placeholder. Those without the required independent
  combination remain LOW or REVIEW rather than being forced to HIGH.
- Generic account-lock texts, romance openers, and job invitations are kept
  below HIGH unless they include the required action and corroboration. This is
  intentional to protect HIGH precision.
- The engine still cannot inspect an image, verify a sender, or determine
  whether an unfamiliar live domain is legitimate. REVIEW is the intended
  route for that uncertainty.

## Round 3 — warning scope and received-message escalation

Round 3 keeps automatic HIGH deliberately narrow. It removes locally quoted
or paraphrased lure text when it appears inside a warning/PSA frame, including
the immediate explanatory sentence. An explicit product/OSS statement that it
does not sell signals also caps the notice below HIGH unless a contrastive,
independent offer follows. These are scope rules, not case-ID exceptions.

For pasted received messages, an action vector (an odd or shortened link,
callback number, app/remote-install request, payment/gift-card demand, or
credential/ID-photo request) plus one weak lure, impersonation, or urgency cue
now reaches REVIEW only. It cannot make a message HIGH by itself. The small
explicit official-host allowlist includes government, selected courier, bank,
IRS, and USPS domains; an official-only link without a money or credential
request does not escalate.

New received-message families cover loan-refinance prepayment, second-hand
safe-payment links, grant/refund impersonation, wallet-connect/seed phrase
requests, tech-support remote access, gift-card payment, unpaid tolls, IRS
impersonation, and grandparent impersonation. Unit tests use newly written
Korean and English examples and benign twins for every family.

### False-positive result

| Set | Before (HIGH / REVIEW / LOW) | After (HIGH / REVIEW / LOW) |
| --- | ---: | ---: |
| DEV red-team benign (36 scorable) | 3 / 7 / 26 | **0 / 7 / 29** |
| Pinned corpus benign (135) | 0 / 26 / 109 | **0 / 24 / 111** |

The three DEV false HIGHs were removed: the educational quotation, the
open-source signal-denial notice, and the weakly quoted warning post. No
benign DEV row and no corpus hard-negative row moved from LOW to REVIEW
(0 and 0 respectively).

### Real warning set

The before column below is a fresh replay of committed 3e20ac9 against the
currently present .ref/real-examples.jsonl; it is therefore reproducible
from this worktree. Counts are HIGH / REVIEW / LOW.

| Category | Before | After |
| --- | ---: | ---: |
| Delivery/parcel smishing (28) | 9 / 0 / 19 | 9 / 14 / 5 |
| Side-job/task scam (8) | 2 / 0 / 6 | 2 / 1 / 5 |
| Institution impersonation (30) | 7 / 2 / 21 | 5 / 8 / 17 |
| Romance-investment (4) | 0 / 0 / 4 | 0 / 0 / 4 |
| Other (3) | 0 / 0 / 3 | 0 / 0 / 3 |
| Investment / fake-loan app (1) | 0 / 0 / 1 | 0 / 0 / 1 |
| Family impersonation (6) | 3 / 0 / 3 | 3 / 0 / 3 |
| Investment/리딩방/fake trading app/pay-to-withdraw (4) | 0 / 0 / 4 | 0 / 1 / 3 |
| **All real warnings (84)** | **21 / 2 / 61** | **19 / 24 / 41** |

The conservative escalation accounts for **23 LOW → REVIEW** real-warning
rows. It does not claim a real-world recall increase: redacted or short
messages remain LOW when they lack both an action vector and a weak supporting
cue.

### DEV red-team lure result

| Set | Before (HIGH / REVIEW / LOW) | After (HIGH / REVIEW / LOW) |
| --- | ---: | ---: |
| Lures (22 scorable) | 4 / 4 / 14 | 4 / 4 / 14 |

The file still contains two intentionally text-empty lure rows, excluded from
scoring. Final pinned-corpus validation remains HIGH precision **1.000
(135/135)**, with zero benign HIGH results.
