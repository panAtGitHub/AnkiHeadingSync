interface RenderObsidianBacklinkAnchorOptions {
  href: string;
  label: string;
  escapeHref?: boolean;
}

interface RenderedBacklinkFields {
  title: string;
  body: string;
}

export function renderObsidianBacklinkAnchor({
  href,
  label,
  escapeHref = true,
}: RenderObsidianBacklinkAnchorOptions): string {
  return `<a class="anki-heading-sync-backlink" href="${escapeHref ? escapeHtml(href) : href}">${escapeHtml(label)}</a>`;
}

export function applyObsidianBacklinkPlacement(
  renderedFields: RenderedBacklinkFields,
  backlinkAnchor: string,
  placement: "question-last-line" | "answer-first-line" | "answer-last-line",
): RenderedBacklinkFields {
  if (placement === "question-last-line") {
    return {
      title: renderedFields.title ? `${renderedFields.title}<br>${backlinkAnchor}` : backlinkAnchor,
      body: renderedFields.body,
    };
  }

  const backlinkLine = `<p>${backlinkAnchor}</p>`;
  if (placement === "answer-first-line") {
    return {
      title: renderedFields.title,
      body: renderedFields.body ? `${backlinkLine}${renderedFields.body}` : backlinkLine,
    };
  }

  return {
    title: renderedFields.title,
    body: renderedFields.body ? `${renderedFields.body}${backlinkLine}` : backlinkLine,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}