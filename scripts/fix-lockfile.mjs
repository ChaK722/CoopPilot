#!/usr/bin/env node
/**
 * One-off repair for Windows-generated package-lock.json files: modern npm
 * prunes foreign-platform optional packages when writing the lockfile on
 * Windows, which makes `npm ci` fail on Linux. This script:
 *   1. restores every missing platform-package entry (mirroring the win32
 *      sibling shapes, or copying full entries from the last known-good
 *      lockfile when available);
 *   2. restores the @img/sharp-* -> @img/sharp-libvips-* optionalDependency
 *      edges that npm prunes alongside the platform packages.
 * Run `node scripts/fix-lockfile.mjs` after regenerating the lockfile on
 * Windows; commit the result.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
let oldLock = {};
try {
  oldLock = JSON.parse(
    execFileSync("git", ["show", "HEAD~1:package-lock.json"], { encoding: "utf8" }),
  );
} catch {
  // no previous commit; proceed with registry-style minimal entries
}

const OS_CPU = {
  "@esbuild/aix-ppc64": ["aix", "ppc64"],
  "@esbuild/android-arm": ["android", "arm"],
  "@esbuild/android-arm64": ["android", "arm64"],
  "@esbuild/android-x64": ["android", "x64"],
  "@esbuild/darwin-arm64": ["darwin", "arm64"],
  "@esbuild/darwin-x64": ["darwin", "x64"],
  "@esbuild/freebsd-arm64": ["freebsd", "arm64"],
  "@esbuild/freebsd-x64": ["freebsd", "x64"],
  "@esbuild/linux-arm": ["linux", "arm"],
  "@esbuild/linux-arm64": ["linux", "arm64"],
  "@esbuild/linux-ia32": ["linux", "ia32"],
  "@esbuild/linux-loong64": ["linux", "loong64"],
  "@esbuild/linux-mips64el": ["linux", "mips64el"],
  "@esbuild/linux-ppc64": ["linux", "ppc64"],
  "@esbuild/linux-riscv64": ["linux", "riscv64"],
  "@esbuild/linux-s390x": ["linux", "s390x"],
  "@esbuild/linux-x64": ["linux", "x64"],
  "@esbuild/netbsd-arm64": ["netbsd", "arm64"],
  "@esbuild/netbsd-x64": ["netbsd", "x64"],
  "@esbuild/openbsd-arm64": ["openbsd", "arm64"],
  "@esbuild/openbsd-x64": ["openbsd", "x64"],
  "@esbuild/openharmony-arm64": ["openharmony", "arm64"],
  "@esbuild/sunos-x64": ["sunos", "x64"],
  "@esbuild/win32-arm64": ["win32", "arm64"],
  "@esbuild/win32-ia32": ["win32", "ia32"],
  "lightningcss-android-arm64": ["android", "arm64"],
  "lightningcss-darwin-arm64": ["darwin", "arm64"],
  "lightningcss-darwin-x64": ["darwin", "x64"],
  "lightningcss-freebsd-x64": ["freebsd", "x64"],
  "lightningcss-linux-arm-gnueabihf": ["linux", "arm"],
  "lightningcss-linux-arm64-gnu": ["linux", "arm64"],
  "lightningcss-linux-arm64-musl": ["linux", "arm64"],
  "lightningcss-linux-x64-gnu": ["linux", "x64"],
  "lightningcss-linux-x64-musl": ["linux", "x64"],
  "lightningcss-win32-arm64-msvc": ["win32", "arm64"],
  "@rolldown/binding-android-arm64": ["android", "arm64"],
  "@rolldown/binding-darwin-arm64": ["darwin", "arm64"],
  "@rolldown/binding-darwin-x64": ["darwin", "x64"],
  "@rolldown/binding-freebsd-x64": ["freebsd", "x64"],
  "@rolldown/binding-linux-arm-gnueabihf": ["linux", "arm"],
  "@rolldown/binding-linux-arm64-gnu": ["linux", "arm64"],
  "@rolldown/binding-linux-arm64-musl": ["linux", "arm64"],
  "@rolldown/binding-linux-ppc64-gnu": ["linux", "ppc64"],
  "@rolldown/binding-linux-s390x-gnu": ["linux", "s390x"],
  "@rolldown/binding-linux-x64-gnu": ["linux", "x64"],
  "@rolldown/binding-linux-x64-musl": ["linux", "x64"],
  "@rolldown/binding-openharmony-arm64": ["openharmony", "arm64"],
  "@rolldown/binding-win32-arm64-msvc": ["win32", "arm64"],
  "@img/sharp-darwin-arm64": ["darwin", "arm64"],
  "@img/sharp-darwin-x64": ["darwin", "x64"],
  "@img/sharp-freebsd-wasm32": ["freebsd", "wasm32"],
  "@img/sharp-linux-arm": ["linux", "arm"],
  "@img/sharp-linux-arm64": ["linux", "arm64"],
  "@img/sharp-linux-ppc64": ["linux", "ppc64"],
  "@img/sharp-linux-riscv64": ["linux", "riscv64"],
  "@img/sharp-linux-s390x": ["linux", "s390x"],
  "@img/sharp-linux-x64": ["linux", "x64"],
  "@img/sharp-linuxmusl-arm64": ["linux", "arm64"],
  "@img/sharp-linuxmusl-x64": ["linux", "x64"],
  "@img/sharp-webcontainers-wasm32": ["webcontainers", "wasm32"],
  "@img/sharp-win32-arm64": ["win32", "arm64"],
  "@img/sharp-win32-ia32": ["win32", "ia32"],
  "@img/sharp-win32-x64": ["win32", "x64"],
  "@img/sharp-wasm32": ["wasm32", "wasm32"],
  "@img/sharp-libvips-darwin-arm64": ["darwin", "arm64"],
  "@img/sharp-libvips-darwin-x64": ["darwin", "x64"],
  "@img/sharp-libvips-linux-arm": ["linux", "arm"],
  "@img/sharp-libvips-linux-arm64": ["linux", "arm64"],
  "@img/sharp-libvips-linux-ppc64": ["linux", "ppc64"],
  "@img/sharp-libvips-linux-riscv64": ["linux", "riscv64"],
  "@img/sharp-libvips-linux-s390x": ["linux", "s390x"],
  "@img/sharp-libvips-linux-x64": ["linux", "x64"],
  "@img/sharp-libvips-linuxmusl-arm64": ["linux", "arm64"],
  "@img/sharp-libvips-linuxmusl-x64": ["linux", "x64"],
  "@img/sharp-libvips-win32-x64": ["win32", "x64"],
  "@embedded-postgres/darwin-arm64": ["darwin", "arm64"],
  "@embedded-postgres/darwin-x64": ["darwin", "x64"],
  "@embedded-postgres/linux-arm": ["linux", "arm"],
  "@embedded-postgres/linux-arm64": ["linux", "arm64"],
  "@embedded-postgres/linux-ia32": ["linux", "ia32"],
  "@embedded-postgres/linux-ppc64": ["linux", "ppc64"],
  "@embedded-postgres/linux-x64": ["linux", "x64"],
};

const SHARP_LIBVIPS = {
  "@img/sharp-darwin-arm64": "@img/sharp-libvips-darwin-arm64",
  "@img/sharp-darwin-x64": "@img/sharp-libvips-darwin-x64",
  "@img/sharp-linux-arm": "@img/sharp-libvips-linux-arm",
  "@img/sharp-linux-arm64": "@img/sharp-libvips-linux-arm64",
  "@img/sharp-linux-ppc64": "@img/sharp-libvips-linux-ppc64",
  "@img/sharp-linux-riscv64": "@img/sharp-libvips-linux-riscv64",
  "@img/sharp-linux-s390x": "@img/sharp-libvips-linux-s390x",
  "@img/sharp-linux-x64": "@img/sharp-libvips-linux-x64",
  "@img/sharp-linuxmusl-arm64": "@img/sharp-libvips-linuxmusl-arm64",
  "@img/sharp-linuxmusl-x64": "@img/sharp-libvips-linuxmusl-x64",
  "@img/sharp-win32-x64": "@img/sharp-libvips-win32-x64",
};

const SHARP_PLATFORM_VERSIONS = {
  "@img/sharp-darwin-arm64": "0.35.3",
  "@img/sharp-darwin-x64": "0.35.3",
  "@img/sharp-freebsd-wasm32": "0.35.3",
  "@img/sharp-linux-arm": "0.35.3",
  "@img/sharp-linux-arm64": "0.35.3",
  "@img/sharp-linux-ppc64": "0.35.3",
  "@img/sharp-linux-riscv64": "0.35.3",
  "@img/sharp-linux-s390x": "0.35.3",
  "@img/sharp-linux-x64": "0.35.3",
  "@img/sharp-linuxmusl-arm64": "0.35.3",
  "@img/sharp-linuxmusl-x64": "0.35.3",
  "@img/sharp-webcontainers-wasm32": "0.35.3",
  "@img/sharp-win32-arm64": "0.35.3",
  "@img/sharp-win32-ia32": "0.35.3",
  "@img/sharp-win32-x64": "0.35.3",
  "@img/sharp-wasm32": "0.35.3",
};

const SHARP_LIBVIPS_VERSIONS = {
  "@img/sharp-libvips-darwin-arm64": "1.3.2",
  "@img/sharp-libvips-darwin-x64": "1.3.2",
  "@img/sharp-libvips-linux-arm": "1.3.2",
  "@img/sharp-libvips-linux-arm64": "1.3.2",
  "@img/sharp-libvips-linux-ppc64": "1.3.2",
  "@img/sharp-libvips-linux-riscv64": "1.3.2",
  "@img/sharp-libvips-linux-s390x": "1.3.2",
  "@img/sharp-libvips-linux-x64": "1.3.2",
  "@img/sharp-libvips-linuxmusl-arm64": "1.3.2",
  "@img/sharp-libvips-linuxmusl-x64": "1.3.2",
  "@img/sharp-libvips-win32-x64": "1.3.2",
};

function expectedVersion(range, name) {
  if (/^\d/.test(range) && !/[<>=~^ ]/.test(range)) return range;
  const old = oldLock.packages?.[`node_modules/${name}`];
  return old?.version ?? range;
}

function templateFor(name) {
  const packages = lock.packages;
  if (name.startsWith("@rolldown/")) {
    return packages["node_modules/@rolldown/binding-win32-x64-msvc"];
  }
  if (name.startsWith("@img/sharp-libvips-")) {
    return (
      packages["node_modules/@img/sharp-libvips-win32-x64"] ??
      packages["node_modules/@img/sharp-win32-x64"]
    );
  }
  if (name.startsWith("@img/sharp-")) {
    return packages["node_modules/@img/sharp-win32-x64"];
  }
  if (name.startsWith("lightningcss-")) {
    return packages["node_modules/lightningcss-win32-x64-msvc"];
  }
  if (name.startsWith("@embedded-postgres/")) {
    return packages["node_modules/@embedded-postgres/windows-x64"];
  }
  return packages["node_modules/@esbuild/win32-x64"];
}

const packages = lock.packages;
let added = 0;
let replaced = 0;

// 1. Restore the @img/sharp-* -> @img/sharp-libvips-* edges.
for (const [sharp, libvips] of Object.entries(SHARP_LIBVIPS)) {
  const key = `node_modules/${sharp}`;
  if (packages[key]) {
    packages[key].optionalDependencies = {
      ...(packages[key].optionalDependencies ?? {}),
      [libvips]: "1.3.2",
    };
  }
}

// 2. Walk every optionalDependencies edge and repair/add entries.
for (const [parentPath, parent] of Object.entries(packages)) {
  if (!parent.optionalDependencies) continue;
  for (const [name, range] of Object.entries(parent.optionalDependencies)) {
    const hoisted = `node_modules/${name}`;
    const nested = parentPath === "" ? null : `${parentPath}/node_modules/${name}`;
    const expected = expectedVersion(range, name);
    const existing = packages[hoisted] ?? (nested && packages[nested]);

    if (existing) {
      const invalid = existing.version === undefined;
      const platformMismatch = Boolean(OS_CPU[name]) && existing.version !== expected;
      if (invalid || platformMismatch) {
        if (oldLock.packages?.[hoisted]?.version === expected) {
          packages[hoisted] = { ...oldLock.packages[hoisted] };
        } else if (OS_CPU[name] && templateFor(name)) {
          const osCpu = OS_CPU[name];
          packages[hoisted] = {
            ...templateFor(name),
            version: expected,
            os: [osCpu[0]],
            cpu: [osCpu[1]],
          };
        }
        replaced += 1;
      }
      continue;
    }

    const oldEntry = oldLock.packages?.[hoisted] ?? (nested && oldLock.packages?.[nested]);
    if (oldEntry && (!OS_CPU[name] || oldEntry.version === expected)) {
      packages[hoisted] = { ...oldEntry };
      added += 1;
      continue;
    }

    if (name === "fsevents") {
      const oldTop = oldLock.packages?.["node_modules/fsevents"];
      if (oldTop) {
        packages[hoisted] = { ...oldTop, version: expected };
        added += 1;
      }
      continue;
    }

    const osCpu = OS_CPU[name];
    if (!osCpu) continue;
    const template = templateFor(name);
    if (!template) continue;
    packages[hoisted] = {
      ...template,
      version: expected,
      os: [osCpu[0]],
      cpu: [osCpu[1]],
    };
    added += 1;
  }
}

// 2b. Normalize the sharp 0.35.3 subtree (the override is not reflected in
// lockfiles generated on Windows; npm keeps the stale 0.34.5 metadata).
const sharpRoot = packages["node_modules/sharp"];
if (sharpRoot) {
  sharpRoot.version = "0.35.3";
  sharpRoot.engines = { node: ">=20.9.0" };
  sharpRoot.license = "Apache-2.0";
  sharpRoot.optionalDependencies = {
    ...Object.fromEntries(
      Object.entries(SHARP_PLATFORM_VERSIONS).map(([name, version]) => [name, version]),
    ),
    ...Object.fromEntries(
      Object.entries(SHARP_LIBVIPS_VERSIONS).map(([name, version]) => [name, version]),
    ),
  };
  delete sharpRoot.resolved;
  delete sharpRoot.integrity;
}
for (const [name, version] of Object.entries(SHARP_PLATFORM_VERSIONS)) {
  const key = `node_modules/${name}`;
  const osCpu = OS_CPU[name];
  if (!osCpu) continue;
  packages[key] = {
    version,
    os: [osCpu[0]],
    cpu: [osCpu[1]],
    optional: true,
    license: "Apache-2.0 AND LGPL-3.0-or-later",
    engines: { node: ">=20.9.0" },
    funding: { url: "https://opencollective.com/libvips" },
  };
}
for (const [name, version] of Object.entries(SHARP_LIBVIPS_VERSIONS)) {
  const key = `node_modules/${name}`;
  const osCpu = OS_CPU[name];
  if (!osCpu) continue;
  packages[key] = {
    version,
    os: [osCpu[0]],
    cpu: [osCpu[1]],
    optional: true,
    license: "LGPL-3.0-or-later",
    funding: { url: "https://opencollective.com/libvips" },
  };
}

// 3. Ensure the top-level and playwright-nested fsevents entries exist.
if (
  packages["node_modules/fsevents"] === undefined &&
  oldLock.packages?.["node_modules/fsevents"]
) {
  packages["node_modules/fsevents"] = { ...oldLock.packages["node_modules/fsevents"] };
  added += 1;
}
const playwrightPath = "node_modules/playwright/node_modules/fsevents";
if (packages[playwrightPath] === undefined && packages["node_modules/fsevents"]) {
  packages[playwrightPath] = {
    ...packages["node_modules/fsevents"],
    version: "2.3.2",
  };
  added += 1;
}

// 4. Restore top-level @emnapi entries if npm pruned them.
for (const name of ["@emnapi/core", "@emnapi/runtime"]) {
  const key = `node_modules/${name}`;
  if (packages[key] === undefined && oldLock.packages?.[key]) {
    packages[key] = { ...oldLock.packages[key] };
    added += 1;
  }
}

lock.packages = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
console.log(`fixed lockfile: added ${added} entries, replaced ${replaced}.`);
