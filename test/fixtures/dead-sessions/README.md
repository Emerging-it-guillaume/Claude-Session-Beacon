# Fixture — one live session among two entries whose process is gone

A clean exit removes its registry entry, so these two survive only because nothing
cleaned up after them. The registry alone cannot tell them from the live one — only the
process probe can, which is why it is the one injected port.

| pid    | `cwd`                | nom de pair          | what the probe finds                    |
| ------ | -------------------- | -------------------- | --------------------------------------- |
| `4201` | `/Users/dev/project` | `project-live-5b`    | a live `claude`                         |
| `4202` | `/Users/dev/project` | `project-ghost-11`   | nothing — session fantôme, crashed       |
| `4203` | `/Users/dev/project` | `project-recycled-90` | a live process that is not `claude`     |

`4203` is the reason liveness is not existence: the pid of a session fantôme can have
been handed to an unrelated program, and answering "alive" there would name a session
that died.
