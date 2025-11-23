"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/renderer/components/ui/button";
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

const SUMMARY_TYPE_OPTIONS = [
  { value: "highlights", label: "Highlights" },
  { value: "action-items", label: "Action items" },
  { value: "decisions", label: "Decisions" }
];

const ICON_OPTIONS = [
  { value: "folder", label: "Folder" },
  { value: "calendar", label: "Calendar" },
  { value: "sparkles", label: "Sparkles" },
  { value: "list-checks", label: "Checklist" }
];

const DEFAULT_FORM = {
  name: "",
  description: "",
  defaultInitialContext: "",
  defaultSummaryPrompt: "",
  defaultSummaryType: SUMMARY_TYPE_OPTIONS[0].value,
  tags: "",
  color: "#7c3aed",
  icon: ICON_OPTIONS[0].value
};

export default function FolderWorkspace() {
  const { activeFolder, updateFolder, deleteFolder } = useApp();
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM }));

  useEffect(() => {
    if (!activeFolder) {
      setForm({ ...DEFAULT_FORM });
      return;
    }
    setForm({
      name: activeFolder.name || "",
      description: activeFolder.description || "",
      defaultInitialContext: activeFolder.defaultInitialContext || "",
      defaultSummaryPrompt: activeFolder.defaultSummaryPrompt || "",
      defaultSummaryType: activeFolder.defaultSummaryType || SUMMARY_TYPE_OPTIONS[0].value,
      tags: (activeFolder.tags || []).join(", "),
      color: activeFolder.color || "#7c3aed",
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

  const handleDelete = useCallback(() => {
    if (!activeFolder?.id) return;
    const confirmed = window.confirm(
      `Delete folder "${activeFolder.name || "New Folder"}"? Notes will remain in All notes.`
    );
    if (!confirmed) return;
    deleteFolder(activeFolder.id);
  }, [activeFolder, deleteFolder]);

  if (!activeFolder) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-background/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folder workspace</p>
          <p className="text-sm font-semibold text-foreground">Manage folder defaults</p>
        </div>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
          Delete folder
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor="folder-edit-name">Name</FieldLabel>
        <FieldContent className="!p-0">
          <Input
            id="folder-edit-name"
            value={form.name}
            onChange={event => handleFieldChange("name", event.target.value)}
            placeholder="New Folder"
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="folder-edit-description">Description</FieldLabel>
        <FieldContent>
          <textarea
            id="folder-edit-description"
            value={form.description}
            onChange={event => handleFieldChange("description", event.target.value)}
            className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="folder-edit-initial-context">Default initial context</FieldLabel>
        <FieldDescription>Prepopulate the initial context box for notes inside this folder.</FieldDescription>
        <FieldContent>
          <textarea
            id="folder-edit-initial-context"
            value={form.defaultInitialContext}
            onChange={event => handleFieldChange("defaultInitialContext", event.target.value)}
            className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="folder-edit-summary-prompt">Default summary prompt</FieldLabel>
        <FieldDescription>Override the summary textarea placeholder inside this folder.</FieldDescription>
        <FieldContent>
          <textarea
            id="folder-edit-summary-prompt"
            value={form.defaultSummaryPrompt}
            onChange={event => handleFieldChange("defaultSummaryPrompt", event.target.value)}
            className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </FieldContent>
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="folder-edit-summary-type">Default summary type</FieldLabel>
          <FieldContent>
            <Select
              id="folder-edit-summary-type"
              value={form.defaultSummaryType}
              onValueChange={value => handleFieldChange("defaultSummaryType", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose type" />
              </SelectTrigger>
              <SelectContent>
                {SUMMARY_TYPE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="folder-edit-tags">Tags</FieldLabel>
          <FieldDescription>Comma-separated labels displayed in the sidebar.</FieldDescription>
          <FieldContent>
            <Input
              id="folder-edit-tags"
              value={form.tags}
              onChange={event => handleFieldChange("tags", event.target.value)}
              placeholder="Standups, Engineering"
            />
          </FieldContent>
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="folder-edit-color">Accent color</FieldLabel>
          <FieldContent>
            <input
              id="folder-edit-color"
              type="color"
              value={form.color}
              onChange={event => handleFieldChange("color", event.target.value)}
              className="h-10 w-10 cursor-pointer rounded-md border border-input p-0"
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="folder-edit-icon">Icon</FieldLabel>
          <FieldDescription>Choose a visual anchor for the folder.</FieldDescription>
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
        </Field>
      </div>
    </section>
  );
}
