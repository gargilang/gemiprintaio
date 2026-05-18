/** Nama dari suffix kolom buku kas (legacy), mis. bagi_hasil_suri → Suri */
export function deriveParticipantNameFromSourceColumn(
  sourceColumn: string
): string | null {
  const m = sourceColumn.match(/^(?:bagi_hasil|kasbon)_(.+)$/i);
  if (!m) return null;
  const words = m[1].split("_").filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function resolveMetricParticipantName(mapping: {
  participant_name: string | null;
  source_column: string;
}): string | null {
  const linked = mapping.participant_name?.trim();
  if (linked) return linked;
  return deriveParticipantNameFromSourceColumn(mapping.source_column);
}

export function participantNameMatches(
  displayName: string,
  candidate: string
): boolean {
  return (
    displayName.localeCompare(candidate, undefined, {
      sensitivity: "accent",
    }) === 0
  );
}
