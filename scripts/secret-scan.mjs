#!/usr/bin/env node
/**
 * Scans committed files for likely secrets and credentials. Runs from a
 * clean checkout context: only `git ls-files` output is inspected (plus the
 * working tree for those same paths), so ignored files such as `.env.local`
 * are never read. Output is limited to file:line + a redacted fragment.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const IGNORED_PATHS = [/^package-lock\.json$/, /^\.git/, /^node_modules\//, /^\.next\//];

const PLACEHOLDER_VALUES = [
  "replace-with-your-supabase-anon-key",
  "replace-with-your-supabase-service-role-key",
  "replace-with-a-development-demo-password",
];

const PATTERNS = [
  {
    name: "Supabase service-role JWT assignment",
    re: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*["']?eyJ[A-Za-z0-9._-]+/,
  },
  { name: "OpenAI-style API key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  {
    name: "Generic JWT secret assignment",
    re: /(?:JWT_SECRET|SUPABASE_JWT_SECRET|SIGNING_SECRET)\s*[=:]\s*["'][^"']{16,}["']/i,
  },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Vercel token", re: /\b[A-Za-z0-9]{24}_[A-Za-z0-9]{24}\b/ },
  { name: "Seed demo password", re: /SEED_DEMO_PASSWORD\s*[=:]\s*["'][^"']+["']/i },
];

function redact(value) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function isPlaceholder(line) {
  return PLACEHOLDER_VALUES.some((value) => line.includes(value));
}

let files;
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
} catch {
  console.error("secret-scan: could not list git files (not a git checkout?).");
  process.exit(2);
}

const findings = [];
for (const file of files) {
  if (IGNORED_PATHS.some((pattern) => pattern.test(file))) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable; skip
  }
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isPlaceholder(line)) continue;
    for (const { name, re } of PATTERNS) {
      const match = line.match(re);
      if (match) {
        const matchText = match[0];
        // Only report the credential portion, not the whole line.
        const valuePart = matchText.replace(/^[^=:]+[=:]\s*["']?/, "");
        findings.push({
          file,
          line: index + 1,
          rule: name,
          fragment: redact(valuePart),
        });
        break;
      }
    }
  }
}

if (findings.length > 0) {
  console.error("secret-scan: potential secrets found in committed files:");
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line} [${finding.rule}] ${finding.fragment}`);
  }
  console.error("Remove the secret, rotate it if it was ever committed, and re-run secret:scan.");
  process.exit(1);
}

console.log("secret-scan: no secrets found in committed files.");
