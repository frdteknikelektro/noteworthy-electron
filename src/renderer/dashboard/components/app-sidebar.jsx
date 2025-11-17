"use client";

import { MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/renderer/components/ui/dropdown-menu";
import { useApp } from "@/renderer/app-provider";

export function AppSidebar({ variant = "sidebar", className, ...props }) {
  const { filteredNotes, activeNoteId, selectNote, createNote, openSettings, deleteNote, isCapturing } = useApp();

  const handleDeleteNote = note => {
    if (!note?.id) return;
    const name = note.title?.trim() || "Untitled note";
    const confirmed = window.confirm(`Delete "${name}" and all associated transcript content? This cannot be undone.`);
    if (!confirmed) return;
    deleteNote(note.id);
  };

  const hasNotes = filteredNotes.length > 0;

  return (
    <Sidebar collapsible="offcanvas" variant={variant} className={className} {...props}>
      <SidebarHeader className="space-y-4 border-b border-border px-2 pb-4 pt-3">
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <span className="text-lg font-semibold tracking-tight">N</span>
          </div>
          <p className="text-lg font-semibold text-foreground">Noteworthy</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full uppercase"
          onClick={createNote}
          disabled={isCapturing}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New note
        </Button>
      </SidebarHeader>
      <SidebarContent className="flex-1 space-y-3 px-1 py-2">
        <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">
          History
        </p>
        {hasNotes ? (
          <SidebarMenu className="flex-1 overflow-y-auto px-1">
            {filteredNotes.map(note => (
              <SidebarMenuItem key={note.id}>
                <SidebarMenuButton
                  type="button"
                  isActive={note.id === activeNoteId}
                  onClick={() => selectNote(note.id)}
                  className="px-3 py-2 text-sm font-medium pr-10"
                >
                  <span className="truncate">{note.title || "Untitled note"}</span>
                </SidebarMenuButton>
                <div className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center group-data-[collapsible=icon]:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-8 w-8 p-0"
                        aria-label={`Open actions for ${note.title || "note"}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleDeleteNote(note)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span>Delete note</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        ) : (
          <div className="px-3 text-sm text-muted-foreground">No notes yet.</div>
        )}
      </SidebarContent>
      <SidebarFooter className="mt-auto px-3 pb-3 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full uppercase"
          onClick={openSettings}
        >
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
