/**
 * @gobing-ai/superskill-core — reusable domain logic extracted from the CLI.
 *
 * Public surface: content editing, quality scoring, conversion pipeline,
 * target taxonomy, marketplace resolution, plugin mapping, and the rulesync
 * wrapper. Package APIs return structured results and throw typed errors;
 * they do not call `process.exit` or write to stdout/stderr.
 */

// ── Content ──────────────────────────────────────────────────────────────────
export * from './content/backup';
export * from './content/edit';
export * from './content/frontmatter';
export * from './content/hash';
export * from './content/identity';
export * from './content/paths';
// ContentType is defined in content/types and re-exported by quality/dimensions;
// `export *` treats the duplicate as ambiguous, so re-export it explicitly.
export type { ContentType } from './content/types';
export * from './content/types';
export * from './mapper';
export * from './marketplace';
export * from './operations/migrate';
// ── Operations ───────────────────────────────────────────────────────────────
export * from './operations/package';
export * from './operations/scaffold';
export * from './operations/validate';
// ── Pipeline ─────────────────────────────────────────────────────────────────
export * from './pipeline/adapt-command';
export * from './pipeline/adapt-subagent';
export * from './pipeline/frontmatter';
export * from './pipeline/frontmatter-walk';
export * from './pipeline/pi-subagent';
export * from './pipeline/pi-tools';
export * from './pipeline/rewrite-references';
export * from './pipeline/slash-command';
// ── Quality ──────────────────────────────────────────────────────────────────
export * from './quality/agent';
export * from './quality/command';
export * from './quality/dimensions';
export * from './quality/hook';
export * from './quality/magent';
export * from './quality/rubric';
export * from './quality/skill';
export * from './rulesync';
// ── Targets / marketplace / mapper / rulesync ────────────────────────────────
export * from './targets';
