// Server-side MoPH drug matcher. Reads public/drugs.json from disk ONCE per
// server instance and reuses it (the file is ~1 MB, so not on every request).
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createMatcher, type DrugRow, type Matcher } from "@/lib/match";

let matcher: Promise<Matcher> | undefined;

export function getMatcher(): Promise<Matcher> {
  if (!matcher) {
    matcher = readFile(path.join(process.cwd(), "public", "drugs.json"), "utf8")
      .then((text) => createMatcher(JSON.parse(text) as DrugRow[]))
      .catch((err) => {
        matcher = undefined; // try again on the next request
        throw err;
      });
  }
  return matcher;
}
