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
import { useApp } from "../../app-provider";

const SEARCH_INPUT_CLASSES =
  "w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50";

const CARD_CLASSES =
  "rounded-2xl border border-slate-100 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/60";

const BADGE_CLASSES = {
  active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  archived: "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

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

export function AppSidebar({ variant = "sidebar", className, ...props }) {
  const {
    notes,
    filteredNotes,
    searchTerm,
    setSearchTerm,
    activeNote,
    setActiveNoteId,
    createNote,
  } = useApp();

  return (
    <Sidebar collapsible="offcanvas" variant={variant} className={className} {...props}>
      <SidebarHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Notes</p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Live library</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredNotes.length} of {notes.length} documents
            </p>
          </div>
          <Button variant="default" type="button" onClick={createNote}>
            New live note
          </Button>
        </div>
        <div>
          <input
            type="search"
            placeholder="Search notes"
            autoComplete="off"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            className={SEARCH_INPUT_CLASSES}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className={`${CARD_CLASSES} p-0`}>
          {filteredNotes.length === 0 ? (
            <div className="p-4 text-sm italic text-slate-500 dark:text-slate-400">
              {searchTerm ? "No documents match that search term." : "No notes available yet."}
            </div>
          ) : (
            <SidebarMenu className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
              {filteredNotes.map(note => {
                const isActive = note.id === activeNote?.id;
                const badgeClass = note.archived ? BADGE_CLASSES.archived : BADGE_CLASSES.active;
                const badgeLabel = note.archived ? "Archived" : "Active";
                const transcriptCount = (note.transcript || []).length;
                return (
                  <SidebarMenuItem key={note.id}>
                    <SidebarMenuButton
                      type="button"
                      aria-pressed={isActive}
                      data-active={isActive ? "true" : undefined}
                      className={cn(
                        "flex w-full flex-col gap-2 rounded-none border-0 px-4 py-3 text-left text-sm transition",
                        isActive
                          ? "border-indigo-400 bg-indigo-50 text-slate-900 dark:border-indigo-500/70 dark:bg-indigo-900/40 dark:text-slate-50"
                          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900/60 dark:hover:border-slate-700",
                        "focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                      )}
                      onClick={() => setActiveNoteId(note.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-50 line-clamp-2">
                          {note.title || "Untitled note"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.3em]",
                            badgeClass
                          )}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                      <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                        Updated {relativeLabel(note.updatedAt || note.createdAt)} · {transcriptCount} entr{transcriptCount === 1 ? "y" : "ies"}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {note.highlightsHtml ? "Highlights saved" : "No highlights yet"}
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
        <Button
          variant="ghost"
          type="button"
          className="w-full text-sm"
          onClick={() => setSearchTerm("")}
          disabled={!searchTerm}
        >
          Clear search
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
