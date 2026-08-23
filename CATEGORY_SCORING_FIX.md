# ShipCheck category/scoring fix

The scanner now keeps two concepts separate:

1. **Detected severity** — every non-suppressed finding is categorized as Critical/High/Medium, including review-only findings.
2. **Score-bearing severity** — only high-confidence production matches affect the risk score.

This means a repository can legitimately show, for example, `13 findings`, `7 Critical detected`, and still have a `100/100` score if those 13 findings are all in test/fixture/mock/example/generated context and therefore marked review-only.

The UI now labels these values explicitly as `Critical detected`, `High detected`, and `Medium detected`, and shows how many findings are review-only versus score-bearing.
