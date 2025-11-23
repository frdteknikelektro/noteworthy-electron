"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/renderer/components/ui/field";
import { Input } from "@/renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/renderer/components/ui/select";
import { useApp } from "@/renderer/app-provider";

const ICON_OPTIONS = [
  { value: "folder", label: "Folder" },
  { value: "calendar", label: "Calendar" },
  { value: "sparkles", label: "Sparkles" },
  { value: "list-checks", label: "Checklist" }
];

const ACCENT_COLOR_OPTIONS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#22c55e", label: "Emerald" },
  { value: "#f97316", label: "Amber" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#ec4899", label: "Fuchsia" }
];

const DEFAULT_FORM = {
  name: "",
  defaultInitialContext: "",
  defaultSummaryPrompt: "",
  tags: "",
  color: ACCENT_COLOR_OPTIONS[0].value,
  icon: ICON_OPTIONS[0].value
};

export default function FolderWorkspace() {
  const { activeFolder, updateFolder } = useApp();
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM }));
  const titleRef = useRef(null);
  const previousFolderIdRef = useRef(null);

  useEffect(() => {
    if (!activeFolder) {
      setForm({ ...DEFAULT_FORM });
      return;
    }
    setForm({
      name: activeFolder.name || "",
      defaultInitialContext: activeFolder.defaultInitialContext || "",
      defaultSummaryPrompt: activeFolder.defaultSummaryPrompt || "",
      tags: (activeFolder.tags || []).join(", "),
      color: activeFolder.color || ACCENT_COLOR_OPTIONS[0].value,
      icon: activeFolder.icon || "folder"
    });
  }, [activeFolder?.id]);

  const handleFieldChange = useCallback(
    (field, value) => {
      setForm(prev => ({ ...prev, [field]: value }));
      if (!activeFolder?.id) return;
      updateFolder(activeFolder.id, { [field]: value });
    },
    [activeFolder?.id, updateFolder]
  );

  const handleNameInput = useCallback(
    event => {
      const value = event.currentTarget.textContent || "";
      setForm(prev => ({ ...prev, name: value }));
      if (!activeFolder?.id) return;
      updateFolder(activeFolder.id, { name: value });
    },
    [activeFolder?.id, updateFolder]
  );

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) return;

    const folderName = activeFolder?.name || "";
    const currentFolderId = activeFolder?.id;

    if (previousFolderIdRef.current !== currentFolderId) {
      titleElement.textContent = folderName;
      previousFolderIdRef.current = currentFolderId;
      return;
    }

    if (document.activeElement === titleElement) return;

    if (titleElement.textContent !== folderName) {
      titleElement.textContent = folderName;
    }
  }, [activeFolder?.id, activeFolder?.name]);

  if (!activeFolder) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto pb-4 px-1 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <div
            role="textbox"
            aria-label="Folder name"
            tabIndex={0}
            className="folder-title text-2xl font-semibold leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder="New folder"
            ref={titleRef}
            onInput={handleNameInput}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-5">
        <Field>
          <FieldLabel htmlFor="folder-edit-initial-context">Default initial context</FieldLabel>
          <FieldContent>
            <textarea
              id="folder-edit-initial-context"
              value={form.defaultInitialContext}
              onChange={event => handleFieldChange("defaultInitialContext", event.target.value)}
              className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </FieldContent>
          <FieldDescription>
            Prepopulate the initial context box for notes inside this folder. Default initial context will be used for new notes.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="folder-edit-summary-prompt">Default summary prompt</FieldLabel>
          <FieldContent>
            <textarea
              id="folder-edit-summary-prompt"
              value={form.defaultSummaryPrompt}
              onChange={event => handleFieldChange("defaultSummaryPrompt", event.target.value)}
              className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </FieldContent>
          <FieldDescription>Override the summary textarea placeholder inside this folder.</FieldDescription>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="folder-edit-tags">Tags</FieldLabel>
            <FieldContent>
              <Input
                id="folder-edit-tags"
                value={form.tags}
                onChange={event => handleFieldChange("tags", event.target.value)}
                placeholder="Standups, Engineering"
              />
            </FieldContent>
            <FieldDescription>Comma-separated labels displayed in the sidebar.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="folder-edit-color">Accent color</FieldLabel>
            <FieldContent>
              <Select
                id="folder-edit-color"
                value={form.color}
                onValueChange={value => handleFieldChange("color", value)}
              >
                <SelectTrigger className="flex items-center justify-between">
                  <SelectValue placeholder="Pick accent" />
                </SelectTrigger>
                <SelectContent>
                  {ACCENT_COLOR_OPTIONS.map(option => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 w-4 rounded-full border border-input shadow-sm"
                          style={{ backgroundColor: option.value }}
                        />
                        <span>{option.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="folder-edit-icon">Icon</FieldLabel>
          <FieldContent>
            <Select
              id="folder-edit-icon"
              value={form.icon}
              onValueChange={value => handleFieldChange("icon", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick icon" />
              </SelectTrigger>
              <SelectContent>
                {ICON_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
          <FieldDescription>Choose a visual anchor for the folder.</FieldDescription>
        </Field>
      </div>
    </div>
  );
}
