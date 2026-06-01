import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useGetDashboardUsers } from "@workspace/api-client-react";
import { getTierBadgeProps, getStatusBadgeProps, formatDate } from "@/lib/display-utils";
import { Search, ChevronLeft, ChevronRight, User } from "lucide-react";

const STATUSES = ["all", "verified", "pending", "failed", "review"];
const TIERS = ["all", "1", "2", "3", "4", "5", "6"];

export default function Users() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tier, setTier] = useState("all");
  const [searchInput, setSearchInput] = useState("");

  const params = {
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(tier !== "all" ? { tier: Number(tier) } : {}),
  };

  const { data, isLoading } = useGetDashboardUsers(params);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleStatusChange(v: string) {
    setStatus(v);
    setPage(1);
  }

  function handleTierChange(v: string) {
    setTier(v);
    setPage(1);
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">All verified and pending user records.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 font-mono text-sm bg-card border-border"
                placeholder="Search username or user ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>

          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[140px] bg-card border-border font-mono text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="font-mono text-sm">
                  {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tier} onValueChange={handleTierChange}>
            <SelectTrigger className="w-[120px] bg-card border-border font-mono text-sm">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t} className="font-mono text-sm">
                  {t === "all" ? "All Tiers" : `Tier ${t}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wider">
              {isLoading ? "Loading..." : `${data?.total ?? 0} users`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0 divide-y divide-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(data?.users ?? []).map((user) => {
                  const tierProps = getTierBadgeProps(user.verificationTier);
                  const statusProps = getStatusBadgeProps(user.status);
                  return (
                    <Link key={user.id} href={`/users/${user.userId}`} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors cursor-pointer group">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {user.avatarUrl ? (
                          <img src={`${user.avatarUrl}?size=64`} alt={user.username} className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                          {user.displayName ?? user.username}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          @{user.username} · {user.userId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`font-mono text-xs ${tierProps.className}`}>
                          {tierProps.label}
                        </Badge>
                        <Badge variant="outline" className={`font-mono text-xs ${statusProps.className}`}>
                          {user.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono hidden lg:block">
                          {formatDate(user.verifiedAt ?? user.createdAt)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {(data?.users ?? []).length === 0 && (
                  <div className="py-16 text-center text-muted-foreground text-sm font-mono">
                    No users found.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-mono">
              Page {data.page} of {data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
