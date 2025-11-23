"use client";

import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";
import FolderWorkspace from "./components/folder-workspace";
import { NoteWorkspace } from "./components/note-workspace";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";
import { useApp } from "@/renderer/app-provider";

export default function Dashboard() {
  const { activeNote, folderWorkspaceOpen, activeFolder } = useApp();
  const showFolderWorkspace = folderWorkspaceOpen && Boolean(activeFolder);
  const showNoteWorkspace = Boolean(activeNote);
  return (
    <SidebarProvider className="h-[100svh] overflow-hidden">
      <AppSidebar variant="inset" className="h-full max-h-full overflow-y-auto" />
      <SidebarInset className="max-h-full">
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="@container/main flex-1 min-h-0 flex-col gap-2 px-4 pt-5 md:px-6 md:pt-6 overflow-hidden">
            <div className="container mx-auto w-full max-w-2xl h-full">
              {showFolderWorkspace ? (
                <FolderWorkspace />
              ) : showNoteWorkspace ? (
                <NoteWorkspace />
              ) : (
                <section className="flex flex-1 flex-col items-center justify-center gap-2 bg-background/80 px-6 py-8 text-center">
                  <p className="text-lg font-semibold text-foreground">No note selected</p>
                  <p className="text-sm text-muted-foreground">
                    Choose a note from the sidebar or create a new one to begin capturing.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
