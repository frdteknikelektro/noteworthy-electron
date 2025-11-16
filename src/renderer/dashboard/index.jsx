"use client";

import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";

export default function Dashboard({ themeIcon, themeLabel, onThemeToggle, onOpenSettings }) {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" className="h-full" onOpenSettings={onOpenSettings} />
      <SidebarInset>
        <SiteHeader
          className="border-b pb-4 dark:border-slate-800/70"
          themeIcon={themeIcon}
          themeLabel={themeLabel}
          onThemeToggle={onThemeToggle}
        />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              Empty
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
