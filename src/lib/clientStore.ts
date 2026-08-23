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
const USER_KEY = "shipcheck_user";
const REPO_KEY = "shipcheck_repositories";

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

export function getUser() {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}

export function saveUser(user: { username: string; email: string; github: string }) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(USER_KEY);
}
