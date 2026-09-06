# Troubleshooting Skills

Start from an observed symptom, identify its owner, and make the smallest supported correction.
Do not rewrite the whole skill merely because a heuristic reports a low score.

| Symptom | Check first | Next action |
|---|---|---|
| Unknown option or target | Exact leaf `--help`, live target guidance, installed CLI version | Correct the invocation; do not guess another flag or assume every family shares options. |
| File not found | Canonical source, current directory, installed name, path resolver | Use the actual path; inspect adapter renaming and duplicate installations. |
| Frontmatter validation fails | The leading YAML block and actual validator finding | Correct the specific field/type; do not parse the entire Markdown body as YAML. |
| Skill never triggers | Native discovery root, eligibility, invocation policy, naming conflicts | Confirm it is listed, then test real positive/paraphrased requests. |
| Skill triggers too broadly | Near misses and neighboring skills | Narrow applicability using observed selection evidence, not a larger trigger list. |
| Explicit invocation works, implicit use fails | Whether the test actually exercised discovery | Review metadata and host policy; forced loading does not certify selection. |
| Grade improves but behavior regresses | Changed requirements, examples, tool flow, evaluator leakage | Restore the needed behavior and compare under unchanged criteria. |
| Refine returns suggestions but body is unchanged | Whether the change is semantic or a deterministic auto-fix | Follow the skill's semantic refinement workflow within the requested scope. |
| Dry run changes the target | The invoking agent's edits as well as CLI behavior | Preserve the original, stop mutations, and investigate the operation boundary. |
| Evolution is rejected | Actual gate reason, source revision, proposal data, case results | Preserve hashes/review evidence and correct the cause; do not strip a guard to pass. |
| Empirical gate produces no behavior evidence | Case name/path resolution, loaded case count, replay backend | Verify cases ran; absent cases can skip, and mock replay is not model evaluation. |
| Resource exists in source but fails after packaging | Bundle contents and relative paths | Check omitted assets/scripts and companion options before calling the package complete. |
| Script path cannot resolve | Actual project/global shared roots and install target | Repair authorized staging; a native-only plugin tree may not populate shared roots. |
| Native companion has no effect | Native schema, installed name, host version, settings precedence | Validate the host contract; a filename or source validator is not integration evidence. |
| Missing tool or dependency | Current capabilities and project environment | Use an equivalent available tool or report the exact blocker; do not fabricate results. |
| Repeated permission prompts | Existing authorization scope/source and native tool rules | Retain valid authorization; request only genuinely missing permission for a concrete action. |
| Evaluation history is empty | Correct identity/store and whether evaluations used `--save` | Report absent history; do not invent prior behavior or scores. |

For CLI JSON, use the actual emitted report/schema and inspect diagnostics as well as exit status.
The skill evaluator can emit a FAIL report without a failing process status; never use exit code alone
to certify quality.

Use [workflows.md](workflows.md) for operation behavior,
[evaluation-framework.md](evaluation-framework.md) for reliable evidence, and
[platform-compatibility.md](platform-compatibility.md) for native checks. Escalate a reproducible
runtime defect to its owning implementation instead of accumulating prompt workarounds.
