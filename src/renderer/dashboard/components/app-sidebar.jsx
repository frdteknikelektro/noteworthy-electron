"use client";

import { ArrowLeft, CalendarDays, Folder as FolderIcon, ListChecks, MoreHorizontal, Plus, Settings, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/renderer/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/renderer/components/ui/dropdown-menu";
import { useApp } from "@/renderer/app-provider";
import { useAudio } from "@/renderer/audio-provider";

const ICON_COMPONENTS = {
  folder: FolderIcon,
  calendar: CalendarDays,
  sparkles: Sparkles,
  "list-checks": ListChecks
};

export function AppSidebar({ variant = "sidebar", className, ...props }) {
  const {
    filteredNotes,
    activeNoteId,
    selectNote,
    createNote,
    openSettings,
    deleteNote,
    folders,
    activeFolder,
    activeFolderId,
    createFolder,
    selectFolder,
    clearFolderSelection
  } = useApp();
  const { isCapturing } = useAudio();

  const hasFolders = folders.length > 0;

  const handleSelectNote = noteId => {
    if (isCapturing) {
      alert("Stop capture before switching notes.");
      return;
    }
    selectNote(noteId);
  };

  const handleDeleteNote = note => {
    if (!note?.id) return;
    if (isCapturing) {
      alert("Stop capture before switching notes.");
      return;
    }
    const name = note.title?.trim() || "Untitled note";
    const confirmed = window.confirm(`Delete "${name}" and all associated transcript content? This cannot be undone.`);
    if (!confirmed) return;
    deleteNote(note.id);
  };

  const handleSelectFolder = folderId => {
    if (isCapturing) {
      alert("Stop capture before switching folders.");
      return;
    }
    selectFolder(folderId);
  };

  const handleClearFolder = () => {
    if (isCapturing) {
      alert("Stop capture before switching folders.");
      return;
    }
    clearFolderSelection();
  };

  const historyEmptyMessage = activeFolder ? "No notes in this folder yet." : "No notes yet.";

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

      <SidebarContent className="flex flex-col flex-1 space-y-3 px-1 py-2 overflow-hidden">
        <div className="space-y-2 flex flex-col border-b border-border pb-4" style={{ maxHeight: "50%" }}>
          <div className="flex items-center justify-between px-3 text-xs font-semibold uppercase text-muted-foreground">
            <span>Folders</span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => createFolder()}
              disabled={isCapturing}
            >
              <Plus className="h-2 w-2" aria-hidden="true" />
              New folder
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-1">
            {hasFolders ? (
              <SidebarMenu className="space-y-1">
                {folders.map(folder => {
                  const Icon = ICON_COMPONENTS[folder.icon] || FolderIcon;
                  return (
                    <SidebarMenuItem key={folder.id}>
                      <SidebarMenuButton
                        type="button"
                        isActive={folder.id === activeFolderId}
                        onClick={() => handleSelectFolder(folder.id)}
                        className="px-3 py-2 text-sm font-medium pr-10"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-7 w-7 place-items-center rounded-lg text-white"
                            style={{ backgroundColor: folder.color || "#7c3aed" }}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="truncate text-sm font-semibold">
                            {folder.name || "New Folder"}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <div className="px-3 text-sm text-muted-foreground">No folders yet.</div>
            )}
          </div>
        </div>

        <div className="space-y-2 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">History</p>
            {activeFolder && (
              <Button variant="ghost" size="sm" className="gap-2" onClick={handleClearFolder}>
                <ArrowLeft className="h-3 w-3" />
                <span>Back</span>
              </Button>
            )}
          </div>
          {activeFolder && (
            <p className="px-3 text-sm font-semibold text-foreground">Folder: {activeFolder.name}</p>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto px-1">
            {filteredNotes.length > 0 ? (
              <SidebarMenu className="space-y-1">
                {filteredNotes.map(note => (
                  <SidebarMenuItem key={note.id}>
                    <SidebarMenuButton
                      type="button"
                      isActive={note.id === activeNoteId}
                      onClick={() => handleSelectNote(note.id)}
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
              <div className="px-3 text-sm text-muted-foreground">{historyEmptyMessage}</div>
            )}
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="mt-auto px-3 pb-3 pt-2">
        <Button variant="ghost" size="sm" className="w-full uppercase" onClick={openSettings}>
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          Settings
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
