import type { ScanReport } from "@/types/reports";

export interface StoredScan {
  scanId: string;
  repoUrl: string;
  score: number;
  grade: string;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  fixed: number;
  createdAt: string;
}

const KEY = "shipcheck_scans";
const REPO_KEY = "shipcheck_repositories";

export function storedScanFromReport(report: ScanReport, fixed = 0): StoredScan {
  return {
    scanId: report.scanId,
    repoUrl: report.repoUrl,
    score: report.risk.score,
    grade: report.risk.grade,
    vulnerabilities: report.findings.length,
    critical: report.risk.counts.Critical,
    high: report.risk.counts.High,
    medium: report.risk.counts.Medium,
    fixed,
    createdAt: report.createdAt,
  };
}

export function getStoredScans(): StoredScan[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveScan(scan: StoredScan) {
  if (typeof window === "undefined") return;
  const scans = getStoredScans().filter(s => s.scanId !== scan.scanId);
  localStorage.setItem(KEY, JSON.stringify([scan, ...scans].slice(0, 50)));
  const repos = getRepositories();
  if (!repos.includes(scan.repoUrl)) localStorage.setItem(REPO_KEY, JSON.stringify([scan.repoUrl, ...repos].slice(0, 20)));
}

export function getRepositories(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REPO_KEY) || "[]"); } catch { return []; }
}

export function removeRepository(url: string) {
  const repos = getRepositories().filter(r => r !== url);
  localStorage.setItem(REPO_KEY, JSON.stringify(repos));
}
