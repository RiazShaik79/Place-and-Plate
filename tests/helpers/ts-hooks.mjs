// Node module hooks so unit tests can import lib/*.ts the way the app does: "@/lib/x" and
// extensionless "./x" both resolve to the .ts file. Node 24 strips the types itself.
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../../", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), ROOT).href;
  const isPath = specifier.startsWith(".") || specifier.startsWith("file:");
  if (isPath && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL ?? ROOT);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(base.href + ext);
      if (fs.existsSync(fileURLToPath(candidate))) return next(pathToFileURL(fileURLToPath(candidate)).href, context);
    }
  }
  return next(specifier, context);
}
