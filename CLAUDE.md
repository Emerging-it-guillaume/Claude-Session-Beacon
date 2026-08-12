# CLAUDE.md

## Git workflow

`develop` is the default and integration branch; `main` advances only by merging `develop`.
Branch off `develop`, target `develop`, never push straight to either. See `docs/agents/git-workflow.md`.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `Emerging-it-guillaume/Claude-Session-Beacon`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
