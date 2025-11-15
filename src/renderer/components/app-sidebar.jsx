"use client";

import { cn } from "@/renderer/lib/utils";
import { Button } from "@/renderer/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/renderer/components/ui/sidebar";

const SECTION_CARD =
  "rounded-2xl border border-slate-200 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-50";
const COMPACT_CARD =
  "rounded-2xl border border-slate-100 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/60";
const SEARCH_INPUT_CLASSES =
  "w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50";

function relativeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function AppSidebar({
  filteredNotes,
  searchTerm,
  onSearchChange,
  onCreateNote,
  onSelectNote,
  activeNote,
  onClearArchivedNotes,
  variant = "sidebar",
  className,
  ...props
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Notes</p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Live library</h2>
          </div>
          <Button variant="default" type="button" onClick={onCreateNote}>
            New live note
          </Button>
        </div>
        <div>
          <input
            type="search"
            value={searchTerm}
            onChange={onSearchChange}
            placeholder="Search notes"
            autoComplete="off"
            className={SEARCH_INPUT_CLASSES}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className={`${COMPACT_CARD} p-0`}>
          {filteredNotes.length === 0 ? (
            <div className="p-4 text-sm italic text-slate-500 dark:text-slate-400">
              {searchTerm ? 'No notes match that search.' : 'No notes yet — capture something to create live notes.'}
            </div>
          ) : (
            <SidebarMenu className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {filteredNotes.map(note => {
                const isActive = note.id === activeNote?.id;
                return (
                  <SidebarMenuItem key={note.id}>
                    <SidebarMenuButton
                      type="button"
                      aria-pressed={isActive}
                      data-active={isActive ? "true" : undefined}
                      className={cn(
                        "w-full rounded-none border-0 px-4 py-3 text-left text-sm transition",
                        isActive
                          ? "border-indigo-400 bg-indigo-50 text-slate-900 dark:border-indigo-500/70 dark:bg-indigo-900/50 dark:text-slate-50"
                          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900/60 dark:hover:border-slate-700",
                        "focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                      )}
                      onClick={() => onSelectNote(note.id)}
                    >
                      <span className="font-semibold">{note.title || 'Untitled note'}</span>
                      <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                        {note.archived ? 'Archived' : 'Active'} • {relativeLabel(note.updatedAt || note.createdAt)}
                      </p>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
        </div>
      </SidebarContent>

      <SidebarFooter>
        <Button variant="ghost" type="button" onClick={onClearArchivedNotes} className="w-full text-sm">
          Clear archived notes
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
