export function buildTranscriptSnippet(note, drafts = {}, limit = 12) {
  if (!note) return "";
  const entries = [
    ...(note.transcript || []),
    ...Object.values(drafts || {}).filter(Boolean)
  ];
  const textParts = entries
    .map(entry => entry.text?.trim())
    .filter(Boolean)
    .slice(-limit);
  return textParts.join("\n");
}
