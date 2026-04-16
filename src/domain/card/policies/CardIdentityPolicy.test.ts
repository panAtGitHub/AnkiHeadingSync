import { describe, expect, it } from "vitest";

import { CardIdentityPolicy } from "./CardIdentityPolicy";
import type { SourceLocation } from "../value-objects/SourceLocation";

describe("CardIdentityPolicy", () => {
  it("creates a stable key for the same source location and type", () => {
    const policy = new CardIdentityPolicy();
    const location: SourceLocation = {
      filePath: "notes/example.md",
      headingLine: 5,
      blockStartLine: 5,
      bodyStartLine: 6,
      blockEndLine: 8,
      headingLevel: 4,
      headingText: "Prompt",
    };

    expect(policy.create(location, "basic")).toBe(policy.create(location, "basic"));
  });

  it("changes the key when a participating identity component changes", () => {
    const policy = new CardIdentityPolicy();
    const location: SourceLocation = {
      filePath: "notes/example.md",
      headingLine: 5,
      blockStartLine: 5,
      bodyStartLine: 6,
      blockEndLine: 8,
      headingLevel: 4,
      headingText: "Prompt",
    };

    const movedLocation: SourceLocation = {
      ...location,
      blockStartLine: 7,
    };

    expect(policy.create(location, "basic")).not.toBe(policy.create(movedLocation, "basic"));
  });
});