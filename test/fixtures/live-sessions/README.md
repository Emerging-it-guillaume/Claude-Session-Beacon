# Fixture — three live sessions, two projects

The registry as a machine in normal use writes it: one `<pid>.json` per live session.

| pid    | `cwd`                | nom de pair    |
| ------ | -------------------- | -------------- |
| `4101` | `/Users/dev/project` | `project-a1`   |
| `4102` | `/Users/dev/project` | `project-7c`   |
| `4103` | `/Users/dev/other`   | `other-2f`     |

`4101` and `4102` share a `cwd`: two windows open on the same project, the situation
ADR-0002 measured and which the `cwd` alone cannot separate. Both are candidates of both
windows here; the parent chain is what tells them apart, and it lands in its own ticket.
