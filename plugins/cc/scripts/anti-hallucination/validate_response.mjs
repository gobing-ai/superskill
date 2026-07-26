#!/usr/bin/env node
// @bun

// plugins/cc/scripts/anti-hallucination/ah_guard.ts
var SOURCE_PATTERNS = [
  /\[Source:\s*[^\]]+\]/i,
  /Source:\s*\[?[^\n]+\]?/i,
  /Sources:\s*\n\s*-\s*\[?[^\n]+\]/i,
  /https?:\/\/[^\s)]+/i,
  /\*\*Source\*\*:\s*[^\n]+/i,
  /\b[a-zA-Z][a-zA-Z0-9_-]*\.(?!(?:com|org|net|edu|gov|mil|io|dev|app|ai|co|info|biz|local|me|us|uk|cn|jp|de|fr|xyz|test|cloud|tech|site|online|store|shop|blog|tv|cc|pro|name|to|ly|gg|fm|au|ca|br|ru|kr|tw|hk|sg|nz|za|mx|es|it|nl|se|no|fi|ch|at|be|ie|pt|cz|ro|hu|tr|il|sa|ae|th|vn|ph|my|pk|bd|ng|eg|ar|cl|pe):)[a-zA-Z0-9]+:\d+(?:-\d+)?/,
  /\bexit\s+code\s+\d+/i,
  /\bexit\s+\d+/i,
  /\b\d+\s+pass(?:ed)?\s+(?:\/|and)\s+\d+\s+fail(?:ed)?\b/i
];
var CONFIDENCE_PATTERNS = [
  /Confidence:\s*\**(?:HIGH|MEDIUM|LOW)\**/i,
  /\*\*Confidence\*\*:\s*(HIGH|MEDIUM|LOW)/i,
  /### Confidence/i
];
var TOOL_PATTERNS = [
  /ref_search_documentation/,
  /ref_read_url/,
  /searchCode/,
  /WebSearch/,
  /WebFetch/,
  /mcp__ref__ref_search_documentation/,
  /mcp__ref__ref_read_url/,
  /mcp__grep__searchCode/
];
var RED_FLAG_PATTERNS = [
  /I (?:think|believe|recall) (?:that|the)?/gi,
  /(?:It|This) (?:should|might|may|could)/gi,
  /Probably|Likely|Possibly/gi,
  /(?:As far as|If I) (?:know|recall)/gi
];
function hasSourceCitations(text) {
  if (!text)
    return false;
  for (const pattern of SOURCE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
function hasConfidenceLevel(text) {
  if (!text)
    return false;
  for (const pattern of CONFIDENCE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
function hasToolUsageEvidence(text) {
  if (!text)
    return false;
  for (const pattern of TOOL_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
function hasRedFlags(text) {
  if (!text)
    return [];
  const foundFlags = [];
  for (const pattern of RED_FLAG_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      foundFlags.push(...matches);
    }
  }
  return foundFlags;
}
var STRONG_CLAIM_PATTERNS = [
  /\bv\d+(?:\.\d+)+\b/i,
  /\b(?:version|release|semver)\s+v?\d+\.\d+/i,
  /(?<![\d.])\d+\.\d+\.\d+(?![\d.])(?!\s*%)/,
  /https?:\/\//,
  /recent\s+(?:change|update|release)/i,
  /\baccording to\b/i,
  /\bdocumentation\s+(?:says|states|shows|confirms)\b/i
];
var WEAK_KEYWORD_PATTERN = /\b(?:api|library|framework|sdk|package|endpoint|documentation)\b/i;
var CLAIM_COUPLER_PATTERN = /\b(?:returns|accepts|expects|supports|requires|provides|exposes|takes|emits|throws|defaults? to)\b/i;
var LIFECYCLE_VERB_PATTERN = /\b(?:was|were|is|are)\s+(?:introduced|added|deprecated|removed|renamed|released)\b/i;
function hasWeakExternalClaim(text) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  return sentences.some((sentence) => WEAK_KEYWORD_PATTERN.test(sentence) && (CLAIM_COUPLER_PATTERN.test(sentence) || LIFECYCLE_VERB_PATTERN.test(sentence)));
}
function requiresExternalVerification(text) {
  if (!text)
    return false;
  for (const pattern of STRONG_CLAIM_PATTERNS) {
    if (pattern.test(text))
      return true;
  }
  return hasWeakExternalClaim(text);
}
function verifyAntiHallucinationProtocol(text) {
  if (!text || text.trim().length === 0) {
    return { ok: true, reason: "Task is complete" };
  }
  const needsVerification = requiresExternalVerification(text);
  if (text.trim().length < 50 && !needsVerification) {
    return { ok: true, reason: "Task is complete" };
  }
  if (!needsVerification) {
    return { ok: true, reason: "Task is complete (internal discussion)" };
  }
  const hasSources = hasSourceCitations(text);
  const hasConfidence = hasConfidenceLevel(text);
  const hasTools = hasToolUsageEvidence(text);
  const redFlags = hasRedFlags(text);
  const issues = [];
  if (!hasSources) {
    issues.push("source citations for API/library claims");
  }
  if (!hasConfidence) {
    issues.push("confidence level (HIGH/MEDIUM/LOW)");
  }
  if (redFlags.length > 0 && !hasTools) {
    const uniqueFlags = Array.from(new Set(redFlags)).slice(0, 3);
    issues.push(`uncertainty phrases detected: ${uniqueFlags.join(", ")}`);
  }
  if (issues.length > 0) {
    const reason = `Add verification for: ${issues.join(", ")}`;
    return { ok: false, reason, issues };
  }
  return { ok: true, reason: "Task is complete" };
}
function readPipedStdin(idleMs = 250) {
  if (process.stdin.isTTY)
    return Promise.resolve("");
  return new Promise((resolve) => {
    let data = "";
    let settled = false;
    let timer;
    const settle = () => {
      if (settled)
        return;
      settled = true;
      if (timer !== undefined)
        clearTimeout(timer);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", settle);
      process.stdin.removeListener("error", settle);
      resolve(data);
    };
    const arm = () => {
      if (timer !== undefined)
        clearTimeout(timer);
      timer = setTimeout(settle, idleMs);
    };
    function onData(chunk) {
      data += chunk.toString();
      arm();
    }
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", onData);
    process.stdin.on("end", settle);
    process.stdin.on("error", settle);
    process.stdin.resume();
    arm();
  });
}
if (false) {}

// plugins/cc/scripts/anti-hallucination/logger.ts
var globalSilent = false;
var logger2 = {
  log: (...args) => {
    if (globalSilent)
      return;
    console.log(...args);
  },
  error: (...args) => {
    if (globalSilent)
      return;
    console.error(...args);
  }
};

// plugins/cc/scripts/anti-hallucination/validate_response.ts
function validateResponseText(text) {
  if (!text || text.trim().length === 0) {
    return { ok: true, reason: "No response text provided" };
  }
  return verifyAntiHallucinationProtocol(text);
}
async function readStdinText(readStdin = readPipedStdin, isTty = Boolean(process.stdin.isTTY)) {
  if (isTty)
    return;
  try {
    const input = await readStdin();
    return input.trim().length > 0 ? input : undefined;
  } catch {
    return;
  }
}
async function main() {
  const responseText = process.env.RESPONSE_TEXT ?? await readStdinText();
  const result = validateResponseText(responseText);
  logger2.log(JSON.stringify(result));
  return result.ok ? 0 : 1;
}
{
  process.exit(await main());
}
export {
  validateResponseText,
  readStdinText,
  main
};
