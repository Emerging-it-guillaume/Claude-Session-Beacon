# Fixture — a Claude configuration directory somewhere other than `~/.claude`

Same shape, another place. `CLAUDE_CONFIG_DIR` is the binary's own rule for moving it, and
the extension duplicates that rule rather than contributing a setting of its own: a third
source of truth would drift from the other two and show as a permanent *session
indéterminée* with nothing to explain it.

One live session, `pid` `4301`, `cwd` `/Users/dev/project`, nom de pair `project-moved-3e`
— a name that appears in no other fixture, so a test that reads it has read this registry
and not another.
