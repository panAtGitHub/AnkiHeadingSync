import type { MediaAsset, RenderedFields } from "@/domain/card/entities/RenderedFields";
import type { IndexedCard } from "@/domain/manual-sync/entities/IndexedCard";

export interface RenderedSyncCard {
  card: IndexedCard;
  noteId?: number;
  deck: string;
  noteModel: string;
  renderConfigHash: string;
  renderedFields: RenderedFields;
  media: MediaAsset[];
}