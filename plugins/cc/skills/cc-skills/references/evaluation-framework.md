# Evaluation Framework

This document describes the evaluation framework for cc:cc-skills. The authoritative source for weights and rules is the `superskill skill evaluate` CLI command.

## Evaluation Scopes

### Basic Scope

Default scope for quick validation. Checks:

1. **Frontmatter Validation**
   - `name` field present and valid
   - `description` field present, descriptive
   - No unknown fields (platform-specific)

2. **Structure Validation**
   - SKILL.md exists
   - Optional directories: extensions/, references/, assets/
   - agents/openai.yaml valid (if present)

3. **Best Practices Check**
   - SKILL.md under 500 lines
   - Progressive disclosure followed
   - Clear section structure

4. **Platform Compatibility**
   - Platform-specific features documented
   - Companion files valid for target platforms

### Full Scope

Comprehensive evaluation including all basic checks plus

1. **Test Case Execution**
   - Run sample prompts with skill
   - Compare with baseline (no skill)
   - Measure success rate

2. **Quality Scoring**
   - 10 dimensions across 4 MECE categories
   - Deterministic (script) + fuzzy (LLM) checks
   - Two weight profiles: with/without scripts

3. **Performance Metrics**
   - Token efficiency
   - Execution time
   - Success rate across platforms

## Evaluation Dimensions (MECE)

4 categories, 10 dimensions, 100 points total.

### Weight Profiles

Skills are scored differently depending on whether they contain executable code:

| Category | Dimension | With Scripts | Without Scripts | What It Checks |
|----------|-----------|:---:|:---:|----------------|
| **Core Quality** | Frontmatter | 10 | 10 | YAML validity, required fields |
| | Structure | 5 | 10 | Directory organization, file layout |
| | Content | 15 | 20 | SKILL.md body quality, examples |
| | Completeness | 10 | 10 | All required sections present |
| **Discovery & Trigger** | Trigger Design | 10 | 10 | Description triggers, when-to-use |
| | Platform Compatibility | 10 | 10 | Multi-platform support |
| **Safety & Security** | Security | 10 | 10 | No dangerous patterns (blacklist/greylist) |
| | Circular Reference | 10 | 10 | No command/agent references |
| **Code & Documentation** | Code Quality | 10 | 0 | Scripts executable, tested |
| | Progressive Disclosure | 10 | 10 | References used, detail offloaded |
| **Total** | | **100** | **100** | |

**Key differences without scripts:** Structure and Content get more weight (+5 each) to compensate for Code Quality being 0.

### Category Totals

| Category | With Scripts | Without Scripts |
|----------|:---:|:---:|
| Core Quality | 40 | 50 |
| Discovery & Trigger | 20 | 20 |
| Safety & Security | 20 | 20 |
| Code & Documentation | 20 | 10 |

### Script Detection

A skill is classified as "with scripts" if it contains any of:
- Bash/shell code blocks
- `!`cmd`` syntax (Claude command execution)
- Variable assignments (`$VAR=`)
- Package manager commands (`bun run`, `npm run`)
- Python script references (`python script.py`)
- References to `extensions/` directory

## Scoring Guide

### Grading Scale

| Grade | Score | Meaning |
|-------|-------|---------|
| **A** | 90-100 | Production ready |
| **B** | 70-89 | Minor fixes needed |
| **C** | 50-69 | Moderate revision |
| **D** | 30-49 | Major revision |
| **F** | 0-29 | Rewrite needed |

### Passing Threshold

- **Basic scope**: All structural checks pass
- **Full scope**: Score >= **70 pts** (Grade B or above)

See [red-flags.md](red-flags.md) for the complete 10-category red flags checklist.

## Security Scanner

The evaluation includes a security scanner with two tiers:

### Blacklist (Immediate REJECT)

Patterns that cause critical security failures:

| Pattern | Reason |
|---------|--------|
| `rm -rf` | Destructive file deletion |
| `curl ... \| sh` | Pipe to shell execution |
| `eval()` / `exec()` | Dynamic code execution |
| `subprocess...shell=True` | Shell injection vulnerability |
| `password=` / `api_key=` | Hardcoded credentials |
| `mkfs.*` | Disk formatting |
| `dd if=...of=/dev/` | Destructive block writes |
| `shutdown` / `reboot` | System shutdown commands |
| Fork bomb patterns | Resource exhaustion |
| `nc -l` / `netcat -l` | Network listeners / bind shells |

### Greylist (Penalty: -2 pts each)

Patterns that warrant warnings:

| Pattern | Reason |
|---------|--------|
| `sudo` (without -n) | May prompt for password |
| `chmod 777` | Insecure permissions |
| `chown -R root:` | Recursive ownership change |
| `os.system()` | Command injection risk |
| `curl -k` / `--insecure` | Disabling SSL checks |
| `git push --force` | Destructive remote push |
| `npm publish` | Risky automated publishing |
| Hardcoded `/tmp/` paths | Use mktemp instead |

See the `superskill skill evaluate --json` output for the complete list.

## Evaluation Report Format

```json
{
  "skillPath": "./skills/my-skill",
  "skillName": "my-skill",
  "scope": "full",
  "overallScore": 82,
  "maxScore": 100,
  "percentage": 82,
  "weightProfile": "withScripts",
  "dimensions": [
    {
      "name": "Frontmatter",
      "category": "Core Quality",
      "weight": 10,
      "score": 9,
      "maxScore": 10,
      "findings": ["Complete frontmatter", "Good description"],
      "recommendations": []
    }
  ],
  "securityFindings": [],
  "timestamp": "2026-03-14T00:00:00Z",
  "passed": true
}
```

## Platform-Specific Evaluation

### Claude Code
- Validates `!`cmd`` syntax
- Checks `$ARGUMENTS` usage
- Verifies `context: fork` compatibility
- Validates `hooks:` configuration

### Codex
- Validates `agents/openai.yaml` format
- Checks UI metadata completeness
- Verifies frontmatter strictness (no unknown fields)

### OpenClaw
- Extracts `metadata.openclaw` validation
- Checks emoji configuration
- Validates requires specifications

### OpenCode
- Checks permission configurations
- Validates config-level skill hints
- Verifies skill invocation patterns

### Antigravity
- Validates Gemini CLI compatibility
- Checks for Gemini-specific extensions
- Verifies standard format compliance

## Iterative Improvement

1. Run evaluation with `--scope full`
2. Review findings and recommendations
3. Apply refinements: `superskill skill refine <nameOrPath> --auto --save`
4. Re-run evaluation to verify improvements
5. Repeat until score >= 70 pts (Grade B)

## Integration with CI/CD

```yaml
# .github/workflows/skill-validation.yml
name: Skill Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Skills
        run: |
          superskill skill validate skills/
```
