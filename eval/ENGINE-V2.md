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
