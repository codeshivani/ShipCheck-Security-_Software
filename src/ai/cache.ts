import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { AIExplanation } from "@/types/reports";

// File-backed cache for the hackathon build (no Redis/DB per scope constraints).
// Keyed by SHA256(file content) + ruleId, as specified. This both avoids
// unnecessary API calls during repeated demo runs and lets the three demo
// repositories be pre-warmed ahead of a live demo.
const CACHE_DIR = path.join(process.cwd(), ".shipcheck-cache");

export function cacheKey(fileContent: string, ruleId: string): string {
  const hash = crypto.createHash("sha256").update(fileContent).digest("hex");
  return `${hash}-${ruleId}`;
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
}

export async function getCached(key: string): Promise<AIExplanation | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${key}.json`), "utf-8");
    return JSON.parse(raw) as AIExplanation;
  } catch {
    return null;
  }
}

export async function setCached(key: string, value: AIExplanation): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value, null, 2), "utf-8").catch(() => {});
}
