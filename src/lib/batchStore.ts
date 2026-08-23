import type { ScanReport } from "@/types/reports";

export interface BatchReportItem {
  repoId: number;
  fullName: string;
  htmlUrl: string;
  status: "complete" | "error";
  report?: ScanReport;
  error?: string;
}

export interface BatchReport {
  batchId: string;
  username: string;
  createdAt: string;
  items: BatchReportItem[];
}

const PREFIX = "shipcheck_batch_";

export function saveBatchReport(batch: BatchReport) {
  if (typeof window === "undefined") return;
  try {
    const value = JSON.stringify(batch);
    try { sessionStorage.setItem(`${PREFIX}${batch.batchId}`, value); }
    catch { localStorage.setItem(`${PREFIX}${batch.batchId}`, value); }
  } catch {
    // Session storage is optional; the current page still shows inline results.
  }
}

export function getBatchReport(batchId: string): BatchReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${batchId}`) ?? localStorage.getItem(`${PREFIX}${batchId}`);
    return raw ? JSON.parse(raw) as BatchReport : null;
  } catch {
    return null;
  }
}
