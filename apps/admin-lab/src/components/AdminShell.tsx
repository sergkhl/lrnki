"use client";

import Link from "next/link";
import {
  DatabaseIcon,
  EyeIcon,
  GitForkIcon,
  NetworkIcon,
  RouteIcon,
  SearchCodeIcon
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";

const VIEWS = [
  { key: "graph", label: "Graph Explorer", href: "/admin/lab", icon: GitForkIcon },
  { key: "runs", label: "Run Inspector", href: "/admin/lab/runs", icon: SearchCodeIcon },
  { key: "sources", label: "Source Explorer", href: "/admin/lab/sources", icon: DatabaseIcon },
  { key: "enrichments", label: "Enrichment Runs", href: "/admin/lab/enrichments", icon: NetworkIcon },
  { key: "paths", label: "Learner Paths", href: "/admin/lab/paths", icon: RouteIcon }
] as const;

export type AdminView = (typeof VIEWS)[number]["key"];

export function AdminShell({
  active = "graph",
  children
}: Readonly<{ active?: AdminView; children: React.ReactNode }>) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Lrnki Admin Lab"
                  render={<Link href="/admin/lab" />}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <GitForkIcon />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-medium">Lrnki</span>
                    <span className="truncate text-xs text-muted-foreground">Admin Lab</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Inspect</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {VIEWS.map((view) => (
                    <SidebarMenuItem key={view.key}>
                      <SidebarMenuButton
                        isActive={view.key === active}
                        tooltip={view.label}
                        render={<Link href={view.href} />}
                      >
                        <view.icon />
                        <span>{view.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Read only" aria-disabled>
                  <EyeIcon />
                  <span>Read only</span>
                  <Badge variant="outline" className="ml-auto group-data-[collapsible=icon]:hidden">
                    Safe
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Learner-neutral core concept graph</p>
              <p className="truncate text-xs text-muted-foreground">Published artifacts and extraction evidence</p>
            </div>
            <Badge variant="outline" className="ml-auto">
              <EyeIcon data-icon="inline-start" />
              Read only
            </Badge>
          </header>
          <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
