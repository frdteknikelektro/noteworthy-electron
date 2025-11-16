"use client";

import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";
import { NoteWorkspace } from "./components/note-workspace";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";

export default function Dashboard() {
  return (
    <SidebarProvider className="h-[100svh] overflow-hidden">
      <AppSidebar variant="inset" className="h-full max-h-full overflow-y-auto" />
      <SidebarInset className="max-h-full">
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="@container/main flex-1 min-h-0 flex-col gap-2 px-4 py-5 md:px-6 md:py-6 overflow-y-auto">
            <NoteWorkspace />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
