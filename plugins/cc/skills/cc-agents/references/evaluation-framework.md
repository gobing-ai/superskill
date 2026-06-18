# Evaluation Framework Reference

## 10 MECE Dimensions

| # | Dimension | Category | Measures | Max Points |
|---|----------|----------|---------|------------|
| 1 | frontmatter-quality | Core Quality | YAML validation, required fields | 10 |
| 2 | description-effectiveness | Discovery & Trigger | Trigger clarity, routing accuracy | 15 |
| 3 | body-quality | Core Quality | Persona/process/rules, instruction clarity | 10-15 |
| 4 | tool-restriction | Safety & Compliance | Tools whitelist/blacklist correctness | 10 |
| 5 | thin-wrapper-compliance | Safety & Compliance | Skill delegation vs implementation | 5-15 |
| 6 | platform-compatibility | Operational | UAM completeness | 10 |
| 7 | naming-convention | Core Quality | Format, length | 5 |
| 8 | operational-readiness | Operational | Output format, examples | 15-20 |
| 9 | security-posture | Safety & Compliance | No dangerous patterns, credential safety | 5 |
| 10 | instruction-clarity | Core Quality | Unambiguous instructions, specificity | 5 |

**MECE Categories:**
- **Core Quality** (30-35 pts): frontmatter-quality, body-quality, naming-convention, instruction-clarity
- **Discovery & Trigger** (15 pts): description-effectiveness
- **Safety & Compliance** (20-30 pts): tool-restriction, thin-wrapper-compliance, security-posture
- **Operational** (20-30 pts): platform-compatibility, operational-readiness

## Weight Profiles

### thin-wrapper (Total: 100)

| Dimension | Weight | Category | Rationale |
|-----------|--------|----------|-----------|
| frontmatter-quality | 10 | Core Quality | Basic requirement |
| description-effectiveness | 15 | Discovery & Trigger | **Critical** for routing |
| body-quality | 10 | Core Quality | Core content |
| tool-restriction | 10 | Safety & Compliance | Tools config |
| thin-wrapper-compliance | 15 | Safety & Compliance | **Critical** - delegates to skills |
| platform-compatibility | 10 | Operational | Cross-platform |
| naming-convention | 5 | Core Quality | Format |
| operational-readiness | 15 | Operational | Completeness |
| security-posture | 5 | Safety & Compliance | Basic security |
| instruction-clarity | 5 | Core Quality | Instruction quality |

### specialist (Total: 100)

| Dimension | Weight | Category | Rationale |
|-----------|--------|----------|-----------|
| frontmatter-quality | 10 | Core Quality | Basic requirement |
| description-effectiveness | 15 | Discovery & Trigger | Discovery & Trigger |
| body-quality | 15 | Core Quality | **Critical** - domain expertise |
| tool-restriction | 10 | Safety & Compliance | Tools config |
| thin-wrapper-compliance | 5 | Safety & Compliance | Less critical for specialists |
| platform-compatibility | 10 | Operational | Cross-platform |
| naming-convention | 5 | Core Quality | Format |
| operational-readiness | 20 | Operational | **Critical** - needs clear output |
| security-posture | 5 | Safety & Compliance | Basic security |
| instruction-clarity | 5 | Core Quality | Instruction quality |

## Scoring Criteria

### frontmatter-quality (0-100%)

- name present (20 pts)
- description present (20 pts)
- valid YAML (20 pts)
- no unknown fields (20 pts)
- proper types (20 pts)

### description-effectiveness (0-100%)

- 50-200 chars (20 pts)
- "Use PROACTIVELY for" pattern (20 pts)
- Has trigger keywords (20 pts)
- Has example blocks (20 pts)
- Not generic (20 pts)

### body-quality (0-100%)

- 50+ lines (10 pts)
- Has section headers (10 pts)
- Has persona/philosophy (15 pts)
- Has DO/DON'T rules (15 pts)
- Has output format (10 pts)
- Has examples (10 pts)
- Has verification steps (15 pts)
- 8-section anatomy (15 pts)

### tool-restriction (0-100%)

- tools field present (30 pts)
- tools is non-empty (30 pts)
- tools appropriate for role (20 pts)
- No redundant tools (20 pts)

### thin-wrapper-compliance (0-100%)

- skills field in frontmatter (25 pts)
- "delegate" language in body (25 pts)
- Uses Skill() invocations (25 pts)
- No direct implementation (25 pts)

### platform-compatibility (0-100%)

- UAM field completeness (40 pts)
- No platform-specific leaks (30 pts)
- Body is portable (30 pts)

### naming-convention (0-100%)

- lowercase (25 pts)
- hyphen-case (25 pts)
- 3-50 chars (25 pts)
- No underscores (25 pts)

### operational-readiness (0-100%)

- Has examples section (25 pts)
- Has output format (25 pts)
- Has verification steps (25 pts)
- Has error handling (25 pts)

### security-posture (0-100%)

- No blacklist patterns found (40 pts)
- No greylist patterns found (30 pts)
- No hardcoded credentials (30 pts)

### instruction-clarity (0-100%)

- No ambiguous language (25 pts)
- Specific actionable instructions (25 pts)
- Clear role definition (25 pts)
- Defined boundaries (25 pts)

## Grading Scale

| Grade | Percentage | Meaning |
|-------|------------|---------|
| A | 90-100% | Excellent |
| B | 80-89% | Good |
| C | 70-79% | Acceptable |
| D | 60-69% | Needs work |
| F | < 60% | Poor |

**Pass threshold**: >= 75% (C grade or above)

## Security Gatekeepers

See [red-flags.md](red-flags.md) for the complete 10-category red flags checklist.

### Blacklist (Immediate Reject)

- Destructive file deletion (rm -rf)
- Pipe to shell (curl | sh)
- Dynamic code execution (eval, exec)
- Hardcoded credentials
- Network listeners (nc -l)

### Greylist (Penalty -2 per occurrence)

- sudo usage
- Insecure permissions (chmod 777)
- os.system usage
- Dynamic imports

## Output Format

```json
{
  "agentPath": "./agents/my-agent.md",
  "agentName": "my-agent",
  "scope": "full",
  "weightProfile": "specialist",
  "overallScore": 85,
  "maxScore": 100,
  "percentage": 85,
  "grade": "B",
  "dimensions": [
    {
      "name": "frontmatter-quality",
      "displayName": "Frontmatter Quality",
      "weight": 10,
      "score": 90,
      "maxScore": 100,
      "findings": [],
      "recommendations": []
    }
  ],
  "timestamp": "2026-03-17T12:00:00Z",
  "passed": true
}
```
