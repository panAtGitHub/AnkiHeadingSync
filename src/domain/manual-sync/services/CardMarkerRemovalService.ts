import { CardMarkerService } from "@/domain/manual-sync/services/CardMarkerService";

export interface MarkerRemovalTarget {
  cardId: string;
}

export interface MarkerRemovalApplyResult {
  nextContent: string;
  removedMarkers: number;
}

export class CardMarkerRemovalService {
  constructor(private readonly markerService = new CardMarkerService()) {}

  apply(sourceContent: string, targets: MarkerRemovalTarget[]): MarkerRemovalApplyResult {
    if (targets.length === 0) {
      return {
        nextContent: sourceContent,
        removedMarkers: 0,
      };
    }

    const targetCardIds = new Set(targets.map((target) => target.cardId));
    const lineEnding = sourceContent.includes("\r\n") ? "\r\n" : "\n";
    const lines = sourceContent.split(/\r?\n/);
    const nextLines: string[] = [];
    let removedMarkers = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!this.markerService.isCandidate(line)) {
        nextLines.push(line);
        continue;
      }

      const marker = this.markerService.parse(line, index + 1);
      if (!marker || !targetCardIds.has(marker.cardId)) {
        nextLines.push(line);
        continue;
      }

      removedMarkers += 1;
    }

    return {
      nextContent: nextLines.join(lineEnding),
      removedMarkers,
    };
  }
}