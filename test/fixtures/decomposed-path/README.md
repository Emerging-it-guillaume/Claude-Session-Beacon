# Fixture — a `cwd` whose accents are decomposed

The `cwd` of `pid` `4401` is `/Users/dev/projet-café` written in NFD: `e` followed by
U+0301 COMBINING ACUTE ACCENT. VS Code hands the same directory over as NFC, a single
U+00E9 — same path on disk, different bytes, and a raw comparison fails. macOS produces
this divergence on its own, which is why both sides are normalised before being compared.

Nom de pair: `projet-cafe-6d`.
