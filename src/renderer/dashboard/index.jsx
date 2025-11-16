"use client";

import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";
import { NoteWorkspace } from "./components/note-workspace";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";

export default function Dashboard() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" className="h-full" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2 px-4 py-5 md:px-6 md:py-6">
            <NoteWorkspace />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
