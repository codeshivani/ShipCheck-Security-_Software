import fs from "fs/promises";
import os from "os";
import path from "path";
import { ScanReport } from "@/types/reports";

export interface ScanSession {
  scanId: string;
  userId: string | null;
  repoDir: string;
  cleanup: () => Promise<void>;
  report: ScanReport;
  createdAt: number;
  lastAccessedAt: number;
}

const sessions = new Map<string, ScanSession>();
export const SESSION_TTL_MS = 10 * 60 * 1000;
const SHIPCHECK_PREFIX = "shipcheck-";

export function saveSession(session: Omit<ScanSession, "lastAccessedAt"> & { lastAccessedAt?: number }) {
  sessions.set(session.scanId, { ...session, lastAccessedAt: session.lastAccessedAt ?? Date.now() });
  void pruneExpired();
}

export function getSession(scanId: string): ScanSession | undefined {
  const session = sessions.get(scanId);
  if (!session) return undefined;
  session.lastAccessedAt = Date.now();
  return session;
}

export function updateSessionReport(scanId: string, report: ScanReport) {
  const s = sessions.get(scanId);
  if (s) {
    s.report = report;
    s.lastAccessedAt = Date.now();
  }
}

export async function pruneExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastAccessedAt > SESSION_TTL_MS) {
      await s.cleanup().catch(() => {});
      sessions.delete(id);
    }
  }
}

export async function cleanupStaleWorkspaces(maxAgeMs = SESSION_TTL_MS) {
  const tempRoot = os.tmpdir();
  const entries = await fs.readdir(tempRoot, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(SHIPCHECK_PREFIX)) continue;
    const dir = path.join(tempRoot, entry.name);
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat) continue;
    if (now - stat.mtimeMs > maxAgeMs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

// Safe startup hygiene: only directories with ShipCheck's own prefix are touched.
void cleanupStaleWorkspaces();
