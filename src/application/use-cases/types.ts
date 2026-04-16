import type { Card } from "@/domain/card/entities/Card";
import type { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";
import type { SyncPlan } from "@/domain/sync/value-objects/SyncPlan";

export interface ScanAndPlanResult {
  cards: Card[];
  registry: SyncRegistry;
  plan: SyncPlan;
  scopedFilePaths: string[];
}

export interface ExecuteSyncPlanResult {
  created: number;
  markedOrphan: number;
  scanned: number;
  unchanged: number;
  updated: number;
  uploadedMedia: number;
}