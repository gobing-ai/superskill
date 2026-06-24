import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EvalCaseError, type EvalCaseSet, loadEvalCases } from '../../src/quality/eval-cases';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TMP_DIR = join(import.meta.dir, '..', '..', 'tmp-eval-case-tests');

/** Valid cases.yaml fixture. */
const validCasesYaml = `version: 1
cases:
  - id: greet-fr
    split: train
    prompt: "Say hello in French"
    reference_kind: exact
    reference: "Bonjour"
  - id: greet-es
    split: holdout
    prompt: "Say hello in Spanish"
    reference_kind: exact
    reference: "Hola"
  - id: rule-check
    split: holdout
    prompt: "List colors"
    reference_kind: rule
    reference:
      checks:
        - op: contains
          arg: "red"
        - op: not_contains
          arg: "purple"
`;

/** cases.yaml with rubric reference kind (Phase 2 — 0069). */
const rubricCasesYaml = `version: 1
cases:
  - id: greet-fr
    split: train
    prompt: "Say hello in French"
    reference_kind: exact
    reference: "Bonjour"
  - id: clarity-judge
    split: holdout
    prompt: "Explain the concept"
    reference_kind: rubric
    reference:
      criterion: "Clarity of explanation"
      excellent: "Crystal clear, step-by-step"
      poor: "Confusing or circular"
`;

/** cases.yaml with unknown reference_kind. */
const unknownKindYaml = `version: 1
cases:
  - id: bad-kind
    split: train
    prompt: "test"
    reference_kind: unknown_kind
    reference: "something"
`;

/** cases.yaml with bad reference_kind/type mismatch. */
const mismatchedKindYaml = `version: 1
cases:
  - id: bad-exact
    split: train
    prompt: "test"
    reference_kind: exact
    reference:
      checks:
        - op: contains
          arg: "x"
`;

/** cases.yaml with rule kind but rubric-shaped object. */
const mismatchedRuleRubricYaml = `version: 1
cases:
  - id: bad-rule-rubric
    split: train
    prompt: "test"
    reference_kind: rule
    reference:
      criterion: "Should not pass as a rule judge"
`;

/** cases.yaml with a missing required field. */
const missingFieldYaml = `version: 1
cases:
  - id: missing-prompt
    split: train
    reference_kind: exact
    reference: "hello"
`;

/** cases.yaml with duplicate case ids. */
const duplicateIdYaml = `version: 1
cases:
  - id: dup
    split: train
    prompt: "A"
    reference_kind: exact
    reference: "A"
  - id: dup
    split: holdout
    prompt: "B"
    reference_kind: exact
    reference: "B"
`;

/** cases.yaml with unsupported schema version. */
const unsupportedVersionYaml = `version: 2
cases:
  - id: future-version
    split: train
    prompt: "test"
    reference_kind: exact
    reference: "hello"
`;

/** cases.yaml with invalid rule op. */
const invalidOpYaml = `version: 1
cases:
  - id: bad-op
    split: train
    prompt: "test"
    reference_kind: rule
    reference:
      checks:
        - op: invalid_op
          arg: "x"
`;

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
});

afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeFixture(skillName: string, content: string): void {
    const dir = join(TMP_DIR, 'skills', skillName, 'eval');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'cases.yaml'), content);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('loadEvalCases', () => {
    it('loads a valid cases.yaml and returns correct structure', () => {
        writeFixture('test-skill', validCasesYaml);

        const cwd = process.cwd;
        try {
            // Override cwd to point at our temp dir so skills/ resolution works
            process.cwd = () => TMP_DIR;

            const result = loadEvalCases('test-skill');
            expect(result).not.toBeNull();
            const set = result as EvalCaseSet;

            expect(set.version).toBe(1);
            expect(set.cases).toHaveLength(3);

            // Verify splits
            const train = set.cases.filter((c) => c.split === 'train');
            const holdout = set.cases.filter((c) => c.split === 'holdout');
            expect(train).toHaveLength(1);
            expect(holdout).toHaveLength(2);

            // Verify exact case
            const exactCase = set.cases.find((c) => c.id === 'greet-fr');
            expect(exactCase).toBeDefined();
            expect(exactCase?.reference_kind).toBe('exact');
            expect(exactCase?.reference).toBe('Bonjour');

            // Verify rule case
            const ruleCase = set.cases.find((c) => c.id === 'rule-check');
            expect(ruleCase).toBeDefined();
            expect(ruleCase?.reference_kind).toBe('rule');
            expect(typeof ruleCase?.reference).toBe('object');
        } finally {
            process.cwd = cwd;
        }
    });

    it('returns null when the file is absent (skip-when-absent)', () => {
        const result = loadEvalCases('nonexistent-skill');
        expect(result).toBeNull();
    });

    it('returns null for explicit path that does not exist', () => {
        const result = loadEvalCases('any', { path: '/nonexistent/path/cases.yaml' });
        expect(result).toBeNull();
    });

    it('throws EvalCaseError on reference_kind/type mismatch', () => {
        writeFixture('bad-skill', mismatchedKindYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('bad-skill')).toThrow(EvalCaseError);
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError when rule kind carries a rubric-shaped reference', () => {
        writeFixture('bad-rule-rubric', mismatchedRuleRubricYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('bad-rule-rubric')).toThrow(EvalCaseError);
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError naming the offending case field on missing required field', () => {
        writeFixture('missing-field', missingFieldYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('missing-field')).toThrow(EvalCaseError);
            expect(() => loadEvalCases('missing-field')).toThrow('missing-prompt');
            expect(() => loadEvalCases('missing-field')).toThrow('prompt');
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError when version is not exactly 1', () => {
        writeFixture('unsupported-version', unsupportedVersionYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('unsupported-version')).toThrow(EvalCaseError);
            expect(() => loadEvalCases('unsupported-version')).toThrow('version');
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError on duplicate case ids', () => {
        writeFixture('dup-ids', duplicateIdYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('dup-ids')).toThrow(EvalCaseError);
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError on invalid rule check op', () => {
        writeFixture('bad-op', invalidOpYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('bad-op')).toThrow(EvalCaseError);
        } finally {
            process.cwd = cwd;
        }
    });

    it('works with an explicit path option', () => {
        const explicitDir = join(TMP_DIR, 'explicit');
        mkdirSync(explicitDir, { recursive: true });
        const explicitPath = join(explicitDir, 'cases.yaml');
        writeFileSync(explicitPath, validCasesYaml);

        const result = loadEvalCases('unused-name', { path: explicitPath });
        expect(result).not.toBeNull();
        expect(result?.cases).toHaveLength(3);
    });

    // ── Phase 2 (0069) — rubric reference kind ────────────────────────────

    it('loads a rubric case with criterion + anchors', () => {
        writeFixture('rubric-skill', rubricCasesYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            const result = loadEvalCases('rubric-skill');
            expect(result).not.toBeNull();

            const rubricCase = result?.cases.find((c) => c.reference_kind === 'rubric');
            expect(rubricCase).toBeDefined();
            expect(rubricCase?.reference_kind).toBe('rubric');

            const ref = rubricCase?.reference as { criterion: string; excellent?: string; poor?: string };
            expect(ref.criterion).toBe('Clarity of explanation');
            expect(ref.excellent).toBe('Crystal clear, step-by-step');
            expect(ref.poor).toBe('Confusing or circular');
        } finally {
            process.cwd = cwd;
        }
    });

    it('throws EvalCaseError on unknown reference_kind', () => {
        writeFixture('bad-kind', unknownKindYaml);

        const cwd = process.cwd;
        try {
            process.cwd = () => TMP_DIR;
            expect(() => loadEvalCases('bad-kind')).toThrow(EvalCaseError);
        } finally {
            process.cwd = cwd;
        }
    });
});
