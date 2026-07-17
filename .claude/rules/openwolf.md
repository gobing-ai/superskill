---
description: Indexed-context protocol enforcement — active on all files
globs: **/*
---

- Check .spur/context/anatomy.md before reading any project file
- Check .spur/context/pitfalls.md do-not-repeat list before generating code
- After writing or editing files, update .spur/context/anatomy.md and append to .spur/context/memory.md
- After receiving a user correction, update .spur/context/learnings.md immediately (preferences, learnings, or decision log)
- LEARN from every interaction: if you discover a convention, user preference, or project pattern, add it to .spur/context/learnings.md. Low threshold — when in doubt, log it.
- BEFORE fixing any bug or error: read .spur/context/buglog.md for known fixes
- AFTER fixing any bug, error, failed test, failed build, or user-reported problem: ALWAYS log to .spur/context/buglog.md with date, file, root cause, fix, and tags
- If you edit a file more than twice in a session, that likely indicates a bug — log it to .spur/context/buglog.md
- Never hand-edit .spur/context/token-ledger.jsonl — it is written by hooks automatically
