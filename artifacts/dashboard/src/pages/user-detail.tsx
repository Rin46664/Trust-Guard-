import { Link, useParams } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetDashboardUser } from "@workspace/api-client-react";
import { getTierBadgeProps, getStatusBadgeProps, formatDate } from "@/lib/display-utils";
import { ArrowLeft, User, Shield, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

function AttemptStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status.includes("failed")) return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "pending_review") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function EventDot({ eventType }: { eventType: string }) {
  if (eventType === "verified") return "bg-green-500";
  if (eventType.includes("failed")) return "bg-red-500";
  if (eventType === "review_requested") return "bg-yellow-500";
  if (eventType === "started") return "bg-indigo-500";
  return "bg-muted-foreground";
}

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const { data, isLoading, isError } = useGetDashboardUser(userId ?? "");

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-6 max-w-4xl">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 md:grid-cols-3">
            <Skeleton className="h-48 md:col-span-1" />
            <Skeleton className="h-48 md:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !data) {
    return (
      <Layout>
        <div className="flex flex-col gap-4">
          <Link href="/users">
            <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Users</Button>
          </Link>
          <div className="text-muted-foreground font-mono text-sm">User not found.</div>
        </div>
      </Layout>
    );
  }

  const { user, attempts, logs } = data;
  const tierProps = getTierBadgeProps(user.verificationTier);
  const statusProps = getStatusBadgeProps(user.status);

  return (
    <Layout>
      <div className="flex flex-col gap-6 max-w-5xl">
        <div className="flex items-center gap-4">
          <Link href="/users">
            <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Users</Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {user.displayName ?? user.username}
          </h1>
          <Badge variant="outline" className={`font-mono text-xs ${statusProps.className}`}>{user.status}</Badge>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Profile Card */}
          <Card className="bg-card md:col-span-1">
            <CardContent className="pt-6 flex flex-col items-center text-center gap-4">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {user.avatarUrl ? (
                  <img src={`${user.avatarUrl}?size=128`} alt={user.username} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="font-semibold text-lg">{user.displayName ?? user.username}</p>
                <p className="text-sm text-muted-foreground font-mono">@{user.username}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className={`font-mono text-xs ${tierProps.className}`}>{tierProps.label}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="bg-card md:col-span-2">
            <CardHeader>
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                <Shield className="h-4 w-4" /> Account Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {[
                  { label: "User ID", value: user.userId },
                  { label: "Guild ID", value: user.guildId },
                  { label: "Risk Score", value: `${user.riskScore}/100` },
                  { label: "Trust Score", value: `${100 - user.riskScore}/100` },
                  { label: "Account Created", value: formatDate(user.accountCreatedAt) },
                  { label: "Joined Server", value: formatDate(user.joinedAt) },
                  { label: "Verified At", value: formatDate(user.verifiedAt) },
                  { label: "Attempts", value: String(user.attemptCount) },
                  { label: "Has Avatar", value: user.hasAvatar ? "Yes" : "No" },
                  { label: "Has Banner", value: user.hasBanner ? "Yes" : "No" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</dt>
                    <dd className="font-mono text-sm break-all">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Verification Attempts */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Verification Attempts</CardTitle>
            <CardDescription>{attempts.length} attempt{attempts.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="px-6 py-4 flex items-start gap-4">
                  <AttemptStatusIcon status={attempt.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium font-mono">#{attempt.id}</span>
                      <Badge variant="outline" className={`font-mono text-xs ${getTierBadgeProps(attempt.tier).className}`}>
                        {getTierBadgeProps(attempt.tier).label}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs text-muted-foreground border-border">
                        {attempt.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground font-mono flex-wrap">
                      <span>Risk: {attempt.riskScore}</span>
                      {attempt.captchaPassed !== null && attempt.captchaPassed !== undefined && (
                        <span className={attempt.captchaPassed ? "text-green-500" : "text-red-500"}>
                          Captcha: {attempt.captchaPassed ? "pass" : "fail"}
                        </span>
                      )}
                      {attempt.questionnairePassed !== null && attempt.questionnairePassed !== undefined && (
                        <span className={attempt.questionnairePassed ? "text-green-500" : "text-red-500"}>
                          Questionnaire: {attempt.questionnairePassed ? "pass" : "fail"}
                        </span>
                      )}
                      {attempt.challengePassed !== null && attempt.challengePassed !== undefined && (
                        <span className={attempt.challengePassed ? "text-green-500" : "text-red-500"}>
                          Challenge: {attempt.challengePassed ? "pass" : "fail"}
                        </span>
                      )}
                    </div>
                    {attempt.failureReason && (
                      <p className="text-xs text-red-400 font-mono mt-1">{attempt.failureReason}</p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {formatDate(attempt.startedAt)}
                      {attempt.completedAt && ` → ${formatDate(attempt.completedAt)}`}
                    </p>
                  </div>
                </div>
              ))}
              {attempts.length === 0 && (
                <div className="py-10 text-center text-muted-foreground text-sm font-mono">No attempts recorded.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Event Log */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="font-mono text-sm uppercase tracking-wider">Event Log</CardTitle>
            <CardDescription>{logs.length} event{logs.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="px-6 py-3 flex items-start gap-4">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${EventDot({ eventType: log.eventType })}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">{log.eventType}</span>
                    </div>
                    {log.metadata && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{log.metadata}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">{formatDate(log.createdAt)}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="py-10 text-center text-muted-foreground text-sm font-mono">No events recorded.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
