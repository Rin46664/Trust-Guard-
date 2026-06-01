import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  ShieldCheck, 
  Users, 
  ListChecks, 
  Activity, 
  LayoutDashboard 
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { useHealthCheck } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const navItems = [
    { title: "Overview", icon: LayoutDashboard, href: "/" },
    { title: "Users", icon: Users, href: "/users" },
    { title: "Pending Reviews", icon: ListChecks, href: "/reviews" },
    { title: "Audit Logs", icon: Activity, href: "/logs" },
  ];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r border-border bg-sidebar">
          <SidebarHeader className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="p-1 bg-primary/20 rounded border border-primary/30">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm leading-tight text-sidebar-foreground">Trust Guard</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Control Room</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Monitoring</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={location === item.href}>
                        <Link href={item.href} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <div className="p-4 border-t border-sidebar-border mt-auto">
            <div className="flex items-center gap-2 text-xs font-mono">
              <div className={`h-2 w-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-muted-foreground">API System: {health?.status === 'ok' ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </Sidebar>

        <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
          <header className="h-14 flex items-center px-4 border-b border-border bg-card/50 backdrop-blur shrink-0 sticky top-0 z-10">
            <SidebarTrigger className="mr-2" />
          </header>
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
