import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { Activity, ShieldAlert, ShieldCheck, UserPlus, Clock } from "lucide-react";
import { getTierBadgeProps, formatDate } from "@/lib/display-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();

  if (isLoading || !stats) {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
            <p className="text-muted-foreground">Real-time verification system metrics.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const riskData = [
    { name: "T1", value: stats.riskDistribution.tier1, color: "hsl(142 71% 45%)" },
    { name: "T2", value: stats.riskDistribution.tier2, color: "hsl(239 84% 67%)" },
    { name: "T3", value: stats.riskDistribution.tier3, color: "hsl(48 96% 53%)" },
    { name: "T4", value: stats.riskDistribution.tier4, color: "hsl(0 84% 60%)" },
    { name: "T5", value: stats.riskDistribution.tier5, color: "hsl(292 84% 61%)" },
    { name: "T6", value: stats.riskDistribution.tier6, color: "hsl(220 13% 60%)" },
  ];

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-sans">Overview</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Real-time verification system metrics.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Verified</CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stats.totalVerified.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Failed</CardTitle>
              <ShieldAlert className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stats.totalFailed.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stats.pendingReviews.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Joins</CardTitle>
              <UserPlus className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stats.dailyJoins.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4 bg-card">
            <CardHeader>
              <CardTitle className="font-mono text-sm uppercase tracking-wider">Risk Distribution</CardTitle>
              <CardDescription>Current tier assignment volume</CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '4px' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {riskData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          
          <Card className="col-span-3 bg-card flex flex-col">
            <CardHeader>
              <CardTitle className="font-mono text-sm uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-4 w-4" /> Activity Feed
              </CardTitle>
              <CardDescription>Recent verification events</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-4">
                {stats.recentActivity.map((log) => (
                  <div key={log.id} className="flex items-start gap-4 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                    <div className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {log.username}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {log.eventType}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </div>
                  </div>
                ))}
                {stats.recentActivity.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">No recent activity</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
