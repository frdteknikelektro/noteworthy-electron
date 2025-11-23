export function buildTranscriptSnippet(note, drafts = {}) {
  if (!note) return "";
  const initialContextText =
    typeof note.initialContext === "string" ? note.initialContext.trim() : "";
  const contextLine = initialContextText || "-";
  const hasInitialTranscript = (note.transcript || []).some(entry => entry.source === "initial");
  const entries = [
    ...(note.transcript || []),
    ...Object.values(drafts || {}).filter(Boolean)
  ];
  const textParts = entries
    .map(entry => entry.text?.trim())
    .filter(Boolean);
  const snippetParts = hasInitialTranscript ? textParts : [contextLine, ...textParts];
  return snippetParts.join("\n");
}
