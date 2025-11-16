"use client";

import { Plus } from "lucide-react";

import { Button } from "@/renderer/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/renderer/components/ui/sidebar";
import { useApp } from "@/renderer/app-provider";

export function AppSidebar({ variant = "sidebar", className, onOpenSettings = () => {}, ...props }) {
  const { filteredNotes, activeNoteId, setActiveNoteId, createNote } = useApp();

  const hasNotes = filteredNotes.length > 0;

  return (
    <Sidebar collapsible="offcanvas" variant={variant} className={className} {...props}>
      <SidebarHeader className="space-y-4 border-b border-border px-2 pb-4 pt-3">
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <span className="text-lg font-semibold tracking-tight">N</span>
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">Noteworthy</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full uppercase tracking-[0.2em]"
          onClick={createNote}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New note
        </Button>
      </SidebarHeader>
      <SidebarContent className="flex-1 space-y-3 px-1 py-2">
        <p className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
          History
        </p>
        {hasNotes ? (
          <SidebarMenu className="flex-1 overflow-y-auto px-1">
            {filteredNotes.map(note => (
              <SidebarMenuItem key={note.id}>
                <SidebarMenuButton
                  type="button"
                  isActive={note.id === activeNoteId}
                  onClick={() => setActiveNoteId(note.id)}
                  className="px-3 py-2 text-sm font-medium"
                >
                  <span className="truncate">{note.title || "Untitled note"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        ) : (
          <div className="px-3 text-sm text-slate-500 dark:text-slate-400">No notes yet.</div>
        )}
      </SidebarContent>
      <SidebarFooter className="mt-auto px-3 pb-3 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full uppercase tracking-[0.25em]"
          onClick={onOpenSettings}
        >
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
