# Red Flags Checklist

Red flags are warning signs that require **immediate verification** before proceeding. When a red flag is detected, STOP and verify before continuing.

## Red Flag Categories

Organized into 10 categories (MECE-compliant):

### 1. Credential & Secret Handling

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Hardcoded passwords in content | Credential exposure | Search for `password`, `passwd`, `pwd` |
| Hardcoded API keys | Token exposure | Search for `api[_-]?key`, `apikey` |
| Hardcoded secrets/tokens | Secret exposure | Search for `secret`, `token`, `auth` |
| Base64-encoded strings | Obfuscation risk | Check for `base64.decode`, `atob()` |

### 2. Command Execution

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Shell command execution (`exec`) | Arbitrary code execution | Search for `exec(`, `subprocess` |
| Dynamic code execution (`eval`) | Arbitrary code injection | Search for `eval(`, `Function(` |
| Shell=True in subprocess | Command injection risk | Search for `shell\s*=\s*True` |
| Pipe to shell (`curl \| sh`) | Remote code execution | Search for `curl.*\|.*sh`, `wget.*\|.*sh` |

### 3. Destructive Operations

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Recursive force delete (`rm -rf`) | Irreversible data loss | Search for `rm\s+-rf` |
| Format/destroy commands | Data destruction | Check for `mkfs`, `dd`, `fdisk` |
| Service termination | Availability impact | Check for `kill`, `pkill`, `systemctl stop` |

### 4. Network Security

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Insecure SSL connections | MITM attack risk | Check for `-k`, `--insecure`, `--no-check-certificate` |
| Network listeners without auth | Unauthorized access | Check for `nc\s+-l`, `netcat` |
| Port scanning | Reconnaissance | Check for `nmap`, port scanning scripts |

### 5. Permission & Access

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Insecure permissions (`chmod 777`) | Unauthorized access | Search for `chmod\s+777` |
| sudo without password check | Privilege escalation | Search for `sudo\s+` (not `-n`) |
| Root-level operations | Security boundary bypass | Check for `root`, `uid\s*==\s*0` |

### 6. Input Validation

| Red Flag | Why | Verification |
|----------|-----|--------------|
| User input in shell commands | Command injection | Check for string concatenation in `Bash()` |
| Unvalidated file paths | Path traversal | Check for `../`, absolute path handling |
| SQL string building | SQL injection | Check for string concatenation in queries |

### 7. Dependency & Import Risks

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Dynamic imports (`__import__`) | Code injection | Search for `__import__(` |
| Eval-based imports | Untrusted code execution | Search for `eval.*import` |
| External dependency without pinning | Supply chain risk | Check for `latest`, unpinned versions |

### 8. Skill-Specific Issues

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Circular references (Skills Reference) | Circular dependencies | Check for `## Skills Reference` section |
| Circular skill references | Infinite loop risk | Search for `/cc:skill-*` self-references |
| Missing required sections | Incomplete skill | Check SKILL.md anatomy |
| SKILL.md too long (>500 lines) | Violates progressive disclosure | Check line count |

### 9. Trigger & Discovery Quality

| Red Flag | Why | Verification |
|----------|-----|--------------|
| Generic description ("A helpful skill") | Poor routing | Check for specific trigger phrases |
| Missing "When to Use" section | Unclear scope | Check for trigger clarity |
| User-invocable phrasing missing | Can't be triggered | Check for "Use when" or "Use for" |
| Description too long (>200 chars) | Information overload | Check description length |

### 10. Content & Documentation Quality

| Red Flag | Why | Verification |
|----------|-----|--------------|
| No examples in skill body | Poor guidance | Check for `<example>` blocks |
| Missing DO/DON'T rules | Unclear boundaries | Check for rules section |
| Overly prescriptive instructions | Inflexibility | Check for conditional guidance |
| Hardcoded examples without placeholders | Brittle content | Check for `{variable}` patterns |

## Quick Reference: Immediate Reject Patterns

These patterns trigger **immediate rejection**:

```
password\s*[:=]\s*['"][^'"]+['"]
api[_-]?key\s*[:=]\s*['"][^'"]+['"]
secret\s*[:=]\s*['"][^'"]+['"]
token\s*[:=]\s*['"][^'"]+['"]
base64\.decode|atob\s*\(
exec\s*\(
eval\s*\(
rm\s+-rf
curl.*\|.*sh
wget.*\|.*sh
subprocess.*shell\s*=\s*True
```

## Quick Reference: Greylist Patterns (Penalty -2 each)

```
sudo\s+(?!-n)
chmod\s+(?:-R\s+)?777
Bash\s*\(\s*\)
Bash\s*\(\s*['"]
os\.system\s*\(
__import__\s*\(
curl\s+(?:-k|--insecure)
wget\s+--no-check-certificate
git\s+push\s+(?:-f|--force)
npm\s+publish
```

## Skill-Specific Red Flags

### Circular Reference Prevention

Skills **must not** reference their associated agents or commands by name:

| Issue | Why | Fix |
|-------|-----|-----|
| `## Skills Reference` section | Explicit skill listing | Remove section, use generic patterns |
| `/cc:skill-*` self-references | Hard coupling | Use `Skill()` instead of direct refs |
| `See also: /cc:skill-*` | Circular reference | Remove or use generic "delegate" |

### Trigger Design Quality

| Issue | Why | Fix |
|-------|-----|-----|
| Generic "A helpful skill" | Can't route properly | Add specific trigger phrases |
| No "Use when" section | Unclear scope | Add When to Use section |
| Too few trigger examples | Poor routing | Add 3+ trigger phrases |

### Progressive Disclosure Violations

| Issue | Why | Fix |
|-------|-----|-----|
| SKILL.md >500 lines | Too much in main file | Run `refine --best-practices` to auto-extract standard sections to references/ |
| No references/ directory | No progressive disclosure | Create references/ with detail docs |
| All content in SKILL.md | No separation of concerns | Split into SKILL.md + references/ |

## Verification Protocol

When a red flag is detected:

1. **STOP** - Do not proceed with the operation
2. **VERIFY** - Confirm the issue exists and understand the risk
3. **FIX** - Apply a safe alternative or add proper safeguards
4. **DOCUMENT** - Note the change in the skill definition

## Fallback Protocol

```
IF red flag detected:
├── Credential/Secret issue:
│   └── Use environment variables or secret management
├── Command execution issue:
│   └── Use parameterized APIs instead of string concatenation
├── Destructive operation:
│   └── Add safety checks (--dry-run, confirmation prompts)
├── Permission issue:
│   └── Use least-privilege principle
└── If cannot fix safely:
    └── Document limitation and skip the operation
```
