// Stable color per agentId, so the same agent looks the same across the trace
// list and the span graph — making "solo vs multi-agent" obvious at a glance.
// Fervon forge palette: anchored on ember/amber, widened with the sanctioned
// secondaries (green, cyan) so agents stay distinguishable at a glance.
const PALETTE = [
  '#ff6a00', // ember
  '#ffb02e', // amber
  '#8fd06b', // green
  '#5bc8d8', // cyan
  '#ff8a66', // coral
  '#ffd76a', // gold
  '#c96f3f', // clay
  '#a3b86b', // olive
];

export function agentColor(agentId: string | null | undefined): string {
  if (!agentId) return '#857567'; // warm neutral for unattributed spans
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] as string;
}
