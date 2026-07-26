#!/bin/bash
# Example SessionStart hook for loading project context
# This script detects project type and sets environment variables

set -euo pipefail

set_context_env() {
  local key=$1
  local value=$2
  local export_line="export $key=$value"
  if ! grep -qxF -- "$export_line" "$CLAUDE_ENV_FILE" 2>/dev/null; then
    printf '%s\n' "$export_line" >> "$CLAUDE_ENV_FILE"
  fi
}

# Navigate to project directory
cd "$CLAUDE_PROJECT_DIR" || exit 1

echo "Loading project context..."

# Detect project type and set environment
if [ -f "package.json" ]; then
  echo "📦 Node.js project detected"
  set_context_env PROJECT_TYPE nodejs

  # Check if TypeScript
  if [ -f "tsconfig.json" ]; then
    set_context_env USES_TYPESCRIPT true
  fi

elif [ -f "Cargo.toml" ]; then
  echo "🦀 Rust project detected"
  set_context_env PROJECT_TYPE rust

elif [ -f "go.mod" ]; then
  echo "🐹 Go project detected"
  set_context_env PROJECT_TYPE go

elif [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  echo "🐍 Python project detected"
  set_context_env PROJECT_TYPE python

elif [ -f "pom.xml" ]; then
  echo "☕ Java (Maven) project detected"
  set_context_env PROJECT_TYPE java
  set_context_env BUILD_SYSTEM maven

elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
  echo "☕ Java/Kotlin (Gradle) project detected"
  set_context_env PROJECT_TYPE java
  set_context_env BUILD_SYSTEM gradle

else
  echo "❓ Unknown project type"
  set_context_env PROJECT_TYPE unknown
fi

# Check for CI configuration
if [ -d ".github/workflows" ] || [ -f ".gitlab-ci.yml" ] || [ -f ".circleci/config.yml" ]; then
  set_context_env HAS_CI true
fi

echo "Project context loaded successfully"
exit 0
