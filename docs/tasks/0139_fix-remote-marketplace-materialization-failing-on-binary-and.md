---
schema_version: 1
name: Fix remote marketplace materialization failing on binary and oversized repository assets
status: done
template: issue
created_at: 2026-09-14T01:08:36.536Z
updated_at: "2026-09-14T14:12:54.413Z"

feature_id: G1
---

## 0139. Fix remote marketplace materialization failing on binary and oversized repository assets

### Background

Remote `--marketplace` resolution (`resolveRemoteMarketplace`, `apps/cli/src/commands/install.ts`) cold-materializes the GitHub tree into `~/.cache/superskill/marketplaces/<owner>/<repo>/<ref>` through `materializeRepoSubdir` (`packages/core/src/skills-ecosystem/fetch.ts`). Reported failure: `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything` aborts with `AcquisitionLimitError` on `homepage/public/images/overview-structural.gif` (10,453,855 B) before any target work, because every blob was read through the 2 MiB SKILL.md text cap and UTF-8 decoded.

**State at refine (2026-09-13).** The fix is already present, uncommitted, in the working tree (`fetch.ts` +66, `fetch.test.ts` +138), and `## Solution` / `## Testing` / `## Review` are authored; status is still `todo`. Premises re-verified against the tree:

- `MAX_MATERIALIZED_BLOB_BYTES` at `fetch.ts:116`, `readBodyBounded` at `:144`, `writeBodyToFileBounded` at `:177`, declared-size pre-check at `:720`, streamed write at `:734`; tree entries carry optional `size` (`fetch.ts:54`).
- `bun test packages/core/tests/skills-ecosystem/fetch.test.ts` → 42 pass / 0 fail.
- `Bun.file().writer()` is acceptable in core: `packages/core/package.json` declares `engines.bun >=1.3.0`, and `Bun.` is already used in `content/hash.ts`, `content/backup.ts`, `operations/validate.ts`.
- The original R3 wording ("no partial file is left in the cache") overstated the guarantee: it holds per blob only. `materializeRepoSubdir` writes straight into the cache dir (no temp dir + rename), so a mid-tree failure can leave sibling blobs behind. Corrected in Requirements; whole-tree atomicity is an explicit non-goal.

### Requirements

- [x] R1. Cold-resolving a GitHub `--marketplace` locator does not fail because a repository blob (text or binary) exceeds the 2 MiB `MAX_RAW_FILE_BYTES` text cap; materialization uses its own per-blob cap `MAX_MATERIALIZED_BLOB_BYTES` (64 MiB).
- [x] R2. Every materialized blob is byte-identical to upstream: blob bodies are streamed to disk and never decoded to text.
- [x] R3. The acquisition bound (task 0126 R9/F9) stays enforced per blob: a blob whose tree-declared `size` exceeds the cap is rejected with `AcquisitionLimitError` before its raw download; a blob with no declared size that streams past the cap is rejected with the same error class and its partially written file is removed.
- [x] R4. No behaviour change to the text paths: SKILL.md (`MAX_RAW_FILE_BYTES`), tree JSON (`MAX_TREE_JSON_BYTES`), and download manifest (`MAX_DOWNLOAD_JSON_BYTES`) keep their caps, `readBodyBounded`, and error shapes; `MAX_MATERIALIZED_FILES` (4096) is unchanged.

**Out of scope / non-goals**

- Whole-tree atomic materialization. `materializeRepoSubdir` writes directly into the cache dir with `MAX_CONCURRENT_FETCHES` (8) parallel blobs, and `resolveRemoteMarketplace` treats any existing `marketplace.json` as a warm cache. A cold materialize that fails mid-tree can leave a partial tree that a later run resolves offline. Pre-existing; neither introduced nor fixed here.
- Project-scope provenance for native targets found during this task's E2E (task 0140).
- A configurable or per-repository cap.

### Acceptance Criteria

- **AC1 (repro, manual E2E — R1)** — Given an isolated HOME with a cold marketplace cache, when `superskill install understand-anything --marketplace Egonex-AI/Understand-Anything` runs at global scope, then resolution does not abort on `homepage/public/images/overview-structural.gif` (10,453,855 B) and the install completes for the configured targets. Run at global scope: project-scope native provenance is task 0140.
- **AC2 (bytes, manual E2E — R2)** — Given the AC1 cache, then `understand-anything-plugin/packages/tree-sitter-swift-wasm/tree-sitter-swift.wasm` (3,825,127 B) has sha256 `0bbf7a0668f8f155addbcd8284880447dbe393b67b5eb09c7b042b02080d9498`, and every blob in the resolved tree is materialized (515/515 when reported; the upstream count may drift).
- **AC3 (boundary, automated — R2, R3)** — `packages/core/tests/skills-ecosystem/fetch.test.ts` proves: a binary blob round-trips byte-for-byte; a blob declared at cap+1 is rejected with zero raw fetches and no dest file; a blob declared exactly at the cap is fetched and written; an undeclared-size blob streamed past the cap throws `AcquisitionLimitError` and leaves no partial file.
- **AC4 (no regression, automated — R4)** — The existing SKILL.md / tree / download-manifest cap tests in `fetch.test.ts` pass unedited, and `bun run lint`, `bun run test`, and `bun run build` are green with no skipped tests.

```gherkin
Scenario: Remote marketplace materialization survives binary and oversized assets
  Given a remote --marketplace repo containing binary or oversized assets
  When install cold-materializes the repo into the marketplace cache
  Then acquisition completes without AcquisitionLimitError
```

### Q&A

- **Cap value (closed):** 64 MiB per blob. It bounds a hostile or huge tree (R9) while clearing real marketplace assets (observed: 10.4 MiB GIF, 3.8 MiB `.wasm`). It is a separate constant from `MAX_RAW_FILE_BYTES` because that cap bounds text held in memory, while this path streams to disk. It is a constant, not a knob.
- **Where the size check runs (closed):** a declared-`size` pre-check before download (no bandwidth, no partial file) plus a streamed byte counter for trees that omit `size`. Tree `size` is advisory, so both are required.
- **Streaming primitive (closed):** `Bun.file(dest).writer()` (`FileSink`). Core already targets Bun (`engines.bun`), so no `node:stream` pipeline and no new dependency.
- **Whole-tree atomicity (deferred):** see Requirements non-goals. Owner: operator files a follow-up task. Trigger: the first partial or stale marketplace-cache report, or any change to warm-cache detection in `resolveRemoteMarketplace`.
- **Project-scope native provenance failure found in E2E (deferred):** owned by task 0140.

### Design

**WHAT** — Give repository-subtree materialization a byte-exact, bounded write path, separate from the bounded text read path.

**WHY** — `materializeRepoSubdir` reused `readBodyBounded` (2 MiB cap + UTF-8 decode). That both aborted on legitimate binary assets and corrupted any binary that fit under the cap. The read helper's contract (bounded text in memory) is right for SKILL.md / tree / manifest JSON and wrong for repository blobs.

**WHERE** — `packages/core/src/skills-ecosystem/fetch.ts` and `packages/core/tests/skills-ecosystem/fetch.test.ts` only. No `apps/cli` change: `resolveRemoteMarketplace` is the sole production caller, and its existing wrap (`Failed to resolve marketplace '<locator>' from <owner>/<repo>[@<ref>] into cache <dir>: <cause>`, `apps/cli/src/commands/install.ts:335-339`) already surfaces the new message.

**Frozen names**

- `export const MAX_MATERIALIZED_BLOB_BYTES = 64 * 1024 * 1024`, exported beside `MAX_MATERIALIZED_FILES`.
- `async function writeBodyToFileBounded(response: Response, destPath: string, limitBytes: number, label: string): Promise<void>`, module-private.
- Label: `blob <path> in <owner/repo>`. Messages: streamed overflow `"<label> exceeds the <limit>-byte read cap"`; declared overflow `"blob <path> in <owner/repo> (<size> bytes) exceeds the <limit>-byte read cap"`. Both throw `AcquisitionLimitError`.
- No other new public API.

**Algorithm (per blob inside `mapWithConcurrency`)**

1. If `blob.size !== undefined && blob.size > MAX_MATERIALIZED_BLOB_BYTES`, throw before calling `fetchFn` (exactly-at-cap is allowed).
2. Fetch the raw URL; non-2xx keeps the existing `Failed to fetch <url>: HTTP <status>`.
3. `mkdir(dirname(dest), { recursive: true })`, then `writeBodyToFileBounded`:
   - no `response.body` → `arrayBuffer()`, length check, `writeFile(dest, Buffer)`;
   - otherwise read chunks, sum `byteLength`; on overflow `reader.cancel()` and throw;
   - `writer.end()` on success; on any error, best-effort `writer.end()`, `rm(destPath, { force: true })`, rethrow.

**Anti-patterns (do not implement)**

- Raising `MAX_RAW_FILE_BYTES`, or routing blobs back through `readBodyBounded` (re-opens UTF-8 corruption).
- `response.text()` or `Buffer#toString` anywhere on the blob path.
- Buffering a whole blob in memory when `response.body` exists.
- A CLI flag or config key for the cap; silently skipping over-cap blobs (over-cap is terminal, R3).
- Temp-dir + rename or cache-poison repair for the whole tree (deferred non-goal).

**Handoff** — No `dependencies[]` and no shared files with 0140. 0140's manual E2E needs this fix landed to get past materialization.

### Plan

1. (R1) Confirm the failing blob's declared size via the GitHub Trees API and reproduce cold resolution against an isolated HOME.
2. (R1, R4) Add `MAX_MATERIALIZED_BLOB_BYTES`; leave `MAX_RAW_FILE_BYTES`, `readBodyBounded`, and the text paths untouched.
3. (R2, R3) Add `writeBodyToFileBounded`; in `materializeRepoSubdir`, pre-check declared `size`, then stream each blob through the helper.
4. (R2, R3) Add tests to `packages/core/tests/skills-ecosystem/fetch.test.ts`: binary round-trip, declared cap+1 (zero raw fetches, no dest file), declared exact cap, and undeclared streamed overflow with partial-file removal.
5. (R4) Run the file-scoped test first, then `bun run lint`, `bun run test`, `bun run build`.
6. (R1, R2) Manual E2E at global scope with an isolated HOME: AC1 plus the AC2 hash check.

Verification intent: AC3 and AC4 are the automated gate. AC1 and AC2 are network-dependent manual evidence, recorded in `## Testing`.

### Root Cause

Two defects in one function, `materializeRepoSubdir` (`packages/core/src/skills-ecosystem/fetch.ts`):

1. **Fatal size cap.** Every materialized blob was read through `readBodyBounded(res, MAX_RAW_FILE_BYTES, …)` — the 2 MiB cap intended for SKILL.md text decoded into memory — and threw `AcquisitionLimitError` on exceedance. A real marketplace repository ships binary assets: `Egonex-AI/Understand-Anything` has `homepage/public/images/overview-structural.gif` at 10,453,855 B, so remote resolution aborted before any target work. This is the reported error.
2. **Binary corruption.** The same call did `Buffer.concat(chunks).toString('utf-8')` and `writeFile(dest, text)`, so any binary blob that *fit* the 2 MiB cap (images, `.wasm`) was written to the cache UTF-8-mangled (invalid byte sequences replaced with U+FFFD, size changed). Downstream `mapPluginToRulesync` copies binaries byte-for-byte but could not undo cache corruption — verified by hashing the materialized `.wasm`, which did not match upstream.

Root cause is the reuse of a text-decoding read helper for a byte-exact materialization path.

### Solution

`packages/core/src/skills-ecosystem/fetch.ts`:
- `MAX_MATERIALIZED_BLOB_BYTES = 64 * 1024 * 1024` (`packages/core/src/skills-ecosystem/fetch.ts:116`, exported alongside `MAX_MATERIALIZED_FILES`) — the materialization bound. Deliberately larger than `MAX_RAW_FILE_BYTES` because that cap bounds text decoded in memory, not repository assets.
- New `writeBodyToFileBounded` (`packages/core/src/skills-ecosystem/fetch.ts:177`) streams `response.body` into the destination via a `Bun` `FileSink`, counting bytes; on overflow it cancels the reader, throws `AcquisitionLimitError` with the existing `"<label> exceeds the <n>-byte read cap"` shape, and removes the partial file. Never decodes to text.
- `materializeRepoSubdir` blob loop (`packages/core/src/skills-ecosystem/fetch.ts:719-734`): rejects a blob whose tree-declared `size` exceeds the cap *before* the raw download, then writes through the new helper with `MAX_MATERIALIZED_BLOB_BYTES`.
- `readBodyBounded` (`packages/core/src/skills-ecosystem/fetch.ts:144`) is unchanged and still serves the SKILL.md / tree / download-manifest text paths (R4).

### Testing

**Pipeline verify results**

- Verdict: PASS (from verdict artifact)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| R1 | MET | `packages/core/src/skills-ecosystem/fetch.ts:116` defines `MAX_MATERIALIZED_BLOB_BYTES = 64 * 1024 * 1024`; `:720` pre-checks the tree-declared `size` against it and `:734` writes with it — not `MAX_RAW_FILE_BYTES` (`:107`, still 2 MiB, now called only from the text paths at `:491`/`:557`/`:618`). Live E2E materialized a 10,453,855 B blob (5× the old cap) and completed. Weakest link: no automated test pins a blob between 2 MiB and 64 MiB; the closest automated half is `packages/core/tests/skills-ecosystem/fetch.test.ts:759` (declared exactly at cap is fetched and written). |
| R2 | MET | Non-decoding streamed write at `packages/core/src/skills-ecosystem/fetch.ts:177-213` (no `response.text()`/`toString()` on this path; `:147`/`:168` belong to the unchanged `readBodyBounded`, reached only by text callers). `packages/core/tests/skills-ecosystem/fetch.test.ts:697` round-trips `89 50 4e 47 00 c3 28 ff fe 00 01` byte-for-byte; the live E2E hashed the materialized `.wasm` to `0bbf…9498` and the downstream claude-cache copy identically. The universal "every blob" claim holds by construction (single write path) plus one binary fixture and one live hash, not by enumerating all 515 blobs. |
| R3 | MET | Pre-check `packages/core/src/skills-ecosystem/fetch.ts:719-724` throws `AcquisitionLimitError` before the fetch, message shape `blob <path> in <owner/repo> (<size> bytes) exceeds the <n>-byte read cap`; streamed overflow `:186-190` cancels the reader, ends the writer, removes the partial file (`:200-207`) and rethrows. Proven by `packages/core/tests/skills-ecosystem/fetch.test.ts:723` (zero raw fetches, empty dest dir) and `:790` (partial file absent); file-scoped run 42 pass / 0 fail. |
| R4 | MET | Caps intact: `packages/core/src/skills-ecosystem/fetch.ts:102` (4096 files), `:107` (2 MiB), `:108` (16 MiB), `:109` (32 MiB). `readBodyBounded` (`:144-169`) is unmodified and its only callers remain `:491` (tree), `:557` (SKILL.md), `:618` (manifest); `materializeRepoSubdir` no longer calls it, and the sole production caller `apps/cli/src/commands/install.ts:328-339` is unchanged. Boundaries exercised at `packages/core/tests/skills-ecosystem/fetch.test.ts:900`, `:924`, `:945`, `:962`, `:991`, `:1017`. |

| Acceptance Criteria | Status | Evidence Type | Evidence |
|---------------------|--------|---------------|----------|
| Scenario: Remote marketplace materialization survives binary and oversized assets | MET | test | Automated: `packages/core/tests/skills-ecosystem/fetch.test.ts:697`, `:723`, `:759`, `:790` — 42 pass / 0 fail for the file, including the 64 MiB cap boundary and partial-file removal on overflow. Command (host, this run): cold-cache global `HOME=<isolated> superskill install understand-anything --marketplace Egonex-AI/Understand-Anything` → exit 0, `Installed 'understand-anything' to 9 target(s).`; 515 blobs materialized, the 10,453,855 B GIF present, `.wasm` sha256 `0bbf7a0668f8f155addbcd8284880447dbe393b67b5eb09c7b042b02080d9498` equal to the AC2 expectation and to the downstream claude-cache copy → no `AcquisitionLimitError`. |
- Coverage: N/A (verdict-based; verify pipeline does not measure code coverage)

### Review

Verified by an independent read-only verifier pass (the `/sp:dev-verify` route — the implementation already landed in `a1b163d` before this task's status advanced, so the task needed verification and recording rather than implementation). The verify answer and verdict are at `.spur/run/0139-verify-answer.txt` and `.spur/run/0139-verdict.json` (verdict PASS, R1–R4 MET, feature scenario MET).

| Priority | Dimension | Location | Finding |
| --- | --- | --- | --- |
| P1 | correctness | `packages/core/src/skills-ecosystem/fetch.ts:116`, `:177-213`, `:719-734` | None. The blob path streams to disk without decoding, the tree-declared size is pre-checked against the materialization cap, and a mid-stream overflow removes the partial file. |
| P2 | documentation | `packages/core/src/skills-ecosystem/fetch.ts:673-676` | Stale comment: it still claims the materialization path reads blobs through `res.text()` and would UTF-8-mangle binary assets — false after this change. The remaining valid reasons for the `skill add` boundary are selective SKILL.md discovery, GitHub-only resolution and git-credential auth. Non-blocking follow-up; not patched here because the Design froze this task's file set. |
| P2 | test coverage | `packages/core/tests/skills-ecosystem/fetch.test.ts:723`, `:759` | No automated case pins a blob whose size sits between the 2 MiB text cap and the 64 MiB materialization cap; the boundary is covered only at exactly-cap and cap+1. The live E2E covered the real 10,453,855-byte asset, so the gap is bounded. |

Residual risk: the live E2E that carries AC1/AC2 is network- and environment-dependent (isolated HOME, cold marketplace cache, upstream repository content). It was reproduced in this run (exit 0, 9 targets, 515 blobs, `.wasm` sha256 equal to the AC expectation), but the scratch tree was deleted afterwards, so the numbers are recorded results rather than re-runnable artifacts. AC4's "pass unedited" clause is UNVERIFIED from a read-only pass (no git access to prove the pre-existing cap tests were untouched).

Out-of-scope finding, now closed elsewhere: the project-scope provenance failure this task surfaced (`writeInstallProvenance` dropping every native-host cache path whose `relative(scopeRoot, abs)` starts with `..`, and the realpath masking case for a `/tmp`-based HOME) is fixed by task 0140 (`1abe66e`), which added the realpath-normalized scope test and the home-rooted snapshot fallback for `claude`/`omp`/`grok`.

Checked: R1–R4 and the automated AC clauses against the code (`fetch.ts:102`, `:107-109`, `:116`, `:144-169`, `:177-213`, `:491`/`:557`/`:618`, `:719-734`, and the unchanged sole production caller `apps/cli/src/commands/install.ts:328-339`); the four blob tests' assertions at `packages/core/tests/skills-ecosystem/fetch.test.ts:697`, `:723`, `:759`, `:790`; the text-path cap tests at `:900`, `:924`, `:945`, `:962`, `:991`, `:1017`; and the live E2E output. Scope discipline confirmed: the Design's named anti-patterns (raising `MAX_RAW_FILE_BYTES`, decoding on the blob path, a cap flag/config, temp-dir+rename) are absent and no `apps/cli` change was required.

### References

- `packages/core/src/skills-ecosystem/fetch.ts` — `materializeRepoSubdir`, `readBodyBounded`, `writeBodyToFileBounded`, `MAX_MATERIALIZED_*` constants.
- `apps/cli/src/commands/install.ts` — `resolveRemoteMarketplace` (sole caller; warm-cache probe).
- Task 0126 — origin of the R9/F9 acquisition bounds.
- Task 0140 — project-scope native provenance failure found during this task's E2E.
- Repro repository: https://github.com/Egonex-AI/Understand-Anything

### History

- 2026-09-14T14:08:56.562Z todo → wip (system)
- 2026-09-14T14:12:54.075Z wip → testing (system)
- 2026-09-14T14:12:54.413Z testing → done (system)

