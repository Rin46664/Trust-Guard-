import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGetPendingReviews, useApproveReview, useDenyReview, getGetPendingReviewsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getTierBadgeProps, formatDate } from "@/lib/display-utils";
import { ChevronLeft, ChevronRight, User, CheckCircle2, XCircle } from "lucide-react";
import type { ReviewSummary } from "@workspace/api-client-react";

type ActionType = "approve" | "deny";

export default function Reviews() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReviewSummary | null>(null);
  const [action, setAction] = useState<ActionType>("approve");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const params = { page, limit: 20 };
  const { data, isLoading } = useGetPendingReviews(params);
  const approveReview = useApproveReview();
  const denyReview = useDenyReview();

  function openAction(review: ReviewSummary, a: ActionType) {
    setSelected(review);
    setAction(a);
    setNotes("");
  }

  async function submitDecision() {
    if (!selected) return;
    const mutate = action === "approve" ? approveReview.mutate : denyReview.mutate;
    mutate(
      { id: selected.id, data: { notes } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPendingReviewsQueryKey(params) });
          setSelected(null);
        },
      }
    );
  }

  function parseQResponses(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pending Reviews</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Accounts awaiting manual staff approval.</p>
        </div>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">
              {isLoading ? "Loading..." : `${data?.total ?? 0} pending`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-6 py-5 flex gap-4 items-start">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                      <Skeleton className="h-3 w-72" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data?.reviews ?? []).map((review) => {
                  const tierProps = getTierBadgeProps(review.tier);
                  const qr = parseQResponses(review.questionnaireResponses);
                  return (
                    <div key={review.id} className="px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {review.avatarUrl ? (
                          <img src={`${review.avatarUrl}?size=64`} alt={review.username} className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">{review.displayName ?? review.username}</span>
                          <span className="text-xs text-muted-foreground font-mono">@{review.username}</span>
                          <Badge variant="outline" className={`font-mono text-xs ${tierProps.className}`}>{tierProps.label}</Badge>
                          <Badge variant="outline" className="font-mono text-xs text-muted-foreground border-border">
                            Risk: {review.riskScore}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mb-2">
                          Submitted {formatDate(review.createdAt)} · ID: {review.userId}
                        </p>

                        {Object.keys(qr).length > 0 && (
                          <div className="bg-muted/30 rounded border border-border p-3 space-y-2">
                            {Object.entries(qr).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{key}: </span>
                                <span className="text-xs font-mono">{val}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0 sm:flex-col sm:items-end">
                        <Button
                          size="sm"
                          className="gap-2 bg-green-600 hover:bg-green-500 text-white"
                          onClick={() => openAction(review, "approve")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-2"
                          onClick={() => openAction(review, "deny")}
                        >
                          <XCircle className="h-4 w-4" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {(data?.reviews ?? []).length === 0 && (
                  <div className="py-20 text-center text-muted-foreground text-sm font-mono">
                    No pending reviews. All clear.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-mono">Page {data.page} of {data.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next<ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {action === "approve" ? "Approve" : "Deny"} — {selected?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Staff Notes (optional)</label>
            <Textarea
              className="mt-2 bg-background border-border font-mono text-sm"
              placeholder="Add notes for the record..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
            <Button
              onClick={submitDecision}
              disabled={approveReview.isPending || denyReview.isPending}
              className={action === "approve" ? "bg-green-600 hover:bg-green-500 text-white" : ""}
              variant={action === "deny" ? "destructive" : "default"}
            >
              {action === "approve" ? "Approve" : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
