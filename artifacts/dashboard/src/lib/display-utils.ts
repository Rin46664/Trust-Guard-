export function getTierBadgeProps(tier: number) {
  switch (tier) {
    case 1: return { label: "T1 Trusted", className: "tier-1" };
    case 2: return { label: "T2 Normal", className: "tier-2" };
    case 3: return { label: "T3 Newer", className: "tier-3" };
    case 4: return { label: "T4 High Risk", className: "tier-4" };
    case 5: return { label: "T5 Extreme Risk", className: "tier-5" };
    case 6: return { label: "T6 Fresh", className: "tier-6" };
    default: return { label: `T${tier} Unknown`, className: "bg-muted text-muted-foreground" };
  }
}

export function getStatusBadgeProps(status: string) {
  switch (status.toLowerCase()) {
    case 'verified': return { className: "bg-green-500/10 text-green-500 border-green-500/20" };
    case 'failed': return { className: "bg-red-500/10 text-red-500 border-red-500/20" };
    case 'review': return { className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" };
    case 'pending': return { className: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" };
    default: return { className: "bg-muted text-muted-foreground border-border" };
  }
}

export function formatDate(dateString: string | undefined | null) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}
