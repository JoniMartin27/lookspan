// Stable color per agentId, so the same agent looks the same across the trace
// list and the span graph — making "solo vs multi-agent" obvious at a glance.
const PALETTE = [
  '#8b5cf6', // brand violet
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#34d399', // emerald
  '#f472b6', // pink
  '#60a5fa', // blue
  '#a3e635', // lime
  '#fb923c', // orange
  '#c084fc', // purple
  '#2dd4bf', // teal
];

export function agentColor(agentId: string | null | undefined): string {
  if (!agentId) return '#71717a'; // neutral for unattributed spans
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] as string;
}
