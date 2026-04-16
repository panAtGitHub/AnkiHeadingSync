import type { SyncRegistry } from "@/domain/sync/entities/SyncRegistry";

export interface SyncRegistryRepository {
  load(): Promise<SyncRegistry>;
  save(registry: SyncRegistry): Promise<void>;
}