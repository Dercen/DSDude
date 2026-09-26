// Fails if any optionalDependency in package-lock.json has no lock entry (a lock rebuilt over node_modules).
import { readFileSync } from "node:fs";

const pkgs = JSON.parse(readFileSync(process.argv[2] ?? "package-lock.json", "utf8")).packages;
const keys = Object.keys(pkgs),
  missing = [];
for (const [path, entry] of Object.entries(pkgs))
  for (const dep of Object.keys(entry.optionalDependencies ?? {}))
    if (!keys.some((k) => k === `node_modules/${dep}` || k.endsWith(`/node_modules/${dep}`)))
      missing.push(`${path || "<root>"} -> ${dep}`);
if (missing.length) {
  console.error(`package-lock.json is missing ${missing.length} optional platform entries:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("package-lock.json: all optional platform entries present");
