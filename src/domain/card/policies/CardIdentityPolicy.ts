import type { CardType } from "../entities/RenderedFields";
import type { SourceLocation } from "../value-objects/SourceLocation";
import { createCardKey, type CardKey } from "../value-objects/CardKey";
import { hashString } from "../../shared/hash";

export class CardIdentityPolicy {
  create(location: SourceLocation, cardType: CardType): CardKey {
    return createCardKey(
      hashString(
        [
          location.filePath,
          String(location.headingLevel),
          location.headingText,
          String(location.blockStartLine),
          cardType,
        ].join("|"),
      ),
    );
  }
}