import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetVerificationLogs } from "@workspace/api-client-react";
import { formatDate } from "@/lib/display-utils";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const EVENT_TYPES = [
  "all", "started", "verified", "captcha_passed", "captcha_failed",
  "questionnaire_passed", "questionnaire_failed", "challenge_passed",
  "challenge_failed", "review_requested", "setup",
];

function eventColor(eventType: string): string {
  if (eventType === "verified") return "bg-green-500/10 text-green-500 border-green-500/20";
  if (eventType.includes("failed")) return "bg-red-500/10 text-red-500 border-red-500/20";
  if (eventType.includes("passed")) return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
  if (eventType === "review_requested") return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  if (eventType === "started") return "bg-muted text-muted-foreground border-border";
  return "bg-muted text-muted-foreground border-border";
}

function dotColor(eventType: string): string {
  if (eventType === "verified") return "bg-green-500";
  if (eventType.includes("failed")) return "bg-red-500";
  if (eventType.includes("passed")) return "bg-indigo-500";
  if (eventType === "review_requested") return "bg-yellow-500";
  return "bg-muted-foreground";
}

export default function Logs() {
  const [page, setPage] = useState(1);
  const [userIdInput, setUserIdInput] = useState("");
  const [userId, setUserId] = useState("");
  const [eventType, setEventType] = useState("all");

  const params = {
    page,
    limit: 50,
    ...(userId ? { userId } : {}),
    ...(eventType !== "all" ? { eventType } : {}),
  };

  const { data, isLoading } = useGetVerificationLogs(params);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setUserId(userIdInput);
    setPage(1);
  }

  function handleEventTypeChange(v: string) {
    setEventType(v);
    setPage(1);
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Full verification event stream.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 font-mono text-sm bg-card border-border"
                placeholder="Filter by User ID..."
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Filter</Button>
          </form>

          <Select value={eventType} onValueChange={handleEventTypeChange}>
            <SelectTrigger className="w-[200px] bg-card border-border font-mono text-sm">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="font-mono text-sm">
                  {t === "all" ? "All Events" : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">
              {isLoading ? "Loading..." : `${data?.total ?? 0} events`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="px-6 py-3 flex gap-4 items-center">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data?.logs ?? []).map((log) => (
                  <div key={log.id} className="px-6 py-3 flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor(log.eventType)}`} />
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className={`font-mono text-xs shrink-0 ${eventColor(log.eventType)}`}>
                        {log.eventType}
                      </Badge>
                      <span className="text-sm font-medium truncate">{log.username}</span>
                      <span className="text-xs text-muted-foreground font-mono truncate hidden sm:block">{log.userId}</span>
                    </div>
                    {log.metadata && (
                      <span className="text-xs text-muted-foreground font-mono truncate hidden lg:block max-w-[200px]">
                        {log.metadata}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{formatDate(log.createdAt)}</span>
                  </div>
                ))}
                {(data?.logs ?? []).length === 0 && (
                  <div className="py-16 text-center text-muted-foreground text-sm font-mono">No events found.</div>
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
    </Layout>
  );
}
