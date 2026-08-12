<p align="center">
  <img src="images/icon.png" alt="" width="128" height="128">
</p>

# Claude Session Beacon

Unofficial extension. Not affiliated with or endorsed by Anthropic. Shows the peer name of the focused Claude Code session in the VS Code status bar, so you can address it without ambiguity.

> **Status** — in development. Nothing is published on the Marketplace yet.

## Why

Claude Code sessions can message each other. A session lists the ones it can reach, picks
one by name, and sends. The name is the address — and it is the whole of the addressing.
Get it wrong and the message does not bounce: it arrives, in a different session, on a
different project, doing different work.

That address is the session's peer name, something like `sentry-server-41`. It is stable
for the life of the process, and it is displayed nowhere you happen to be looking. The
listing hands you names with no context. The tab in front of you shows a conversation
title, which *describes* a session but does not *address* it. Nothing joins the two, so
you end up designating sessions by approximation — "the one on the left", "the one on the
server" — and addressing them by guess.

This extension joins them. It puts the peer name of the focused session in the status bar
of every window, and copies it to the clipboard on click: you read the name of the session
you are actually looking at, and paste it straight into the message.

**It never shows a peer name it is not sure of.** When identification fails — a brand new
tab with no title yet, two tabs with the same title, a Claude Code update that moves
something — the status bar says *indeterminate session*, explicitly. A plausible but wrong
peer name is the one failure that is both costly and silent.

## Data commitment

This extension reads Claude Code transcripts. Those files contain your source code and,
now and then, your secrets. "It stays on your machine anyway" is not an answer to that.

So the commitment is written as five design constraints rather than as a paragraph asking
for trust. Each one is checkable — on this repository, and on the published `.vsix`.

1. **Read-only.** The extension never writes, moves or deletes anything in the Claude
   configuration directory. Ghost sessions — registry entries whose process died without
   cleaning up — are left exactly where they are, including the ones it has established
   are dead.
2. **Only `ai-title` records are deserialised.** A transcript line is parsed only if it is
   a conversation title. Prompts, responses, tool calls and file contents are never turned
   into values — they are skipped as bytes.
3. **The end of the file only.** Transcripts are read backwards from the tail, never walked
   from the beginning, so the bulk of a conversation is never even read off disk.
4. **Zero runtime dependencies.** The published package contains no third-party code. No
   library ships in a position to read your transcripts.
5. **No network access.** Nothing is sent anywhere, and there is no telemetry. The
   extension makes no outbound connection at all.

### Checking it yourself

| Constraint | How to check |
| --- | --- |
| Read-only | `rg 'writeFile\|appendFile\|unlink\|rename\|mkdir\|rmdir' src/` — nothing |
| Only `ai-title` | `rg 'JSON.parse' src/` — every call site is a title lookup |
| End of the file only | `rg 'readFile\|createReadStream\|read\(' src/` — every read is positioned from the file size |
| Zero runtime dependencies | `dependencies` is absent from [`package.json`](package.json), and `npm ls --omit=dev` lists nothing |
| No network access | `rg '\bhttps?\b\|fetch\|node:net\|node:dns\|node:tls' src/` — nothing |

`src/` is what ships. `scripts/` builds the logo and checks this repository against itself;
it is excluded from the package and never runs on your machine.

The last two constraints also hold on the published artefact, which is what makes them
worth stating: unzip the `.vsix` and there is no `node_modules`, and no network API appears
anywhere in the bundle.

## Vocabulary

Two things get confused constantly, and the whole extension turns on the distinction:

- **Peer name** — the name that acts as an **address** in session-to-session messages
  (`sentry-server-41`). This is what the status bar shows.
- **Conversation title** — the auto-generated summary of the first message. A human
  **label**, never an address. This is what the tab shows.

## Requirements

- VS Code 1.94 or later
- Claude Code, with at least one session started

In WSL, SSH and containers the extension runs on the side where `claude` runs, which is
where the sessions and transcripts actually live.

## Name and affiliation

This is a personal project. It is not built, reviewed or endorsed by Anthropic. The name
starts with "Claude" because that is what the extension is about, not who it is from. The
logo is a VS Code tab lifted out of a row — no borrowed mark, though its colours sit
deliberately in Claude's own family, so the extension reads as something that belongs
beside Claude Code rather than apart from it. It is still not theirs.

It relies on undocumented details of the Claude Code extension, which an update can change
at any time. When that happens, the status bar says *indeterminate session* and the
`Claude Session Beacon: Diagnose` command reports what it actually observed.

## Licence

[MIT](LICENSE).
