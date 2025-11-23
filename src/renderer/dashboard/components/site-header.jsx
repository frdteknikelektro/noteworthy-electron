import { Separator } from "@/renderer/components/ui/separator";
import { SidebarTrigger } from "@/renderer/components/ui/sidebar";
import { Switch } from "@/renderer/components/ui/switch";
import { useApp } from "@/renderer/app-provider";
import { THEME_LABELS, THEME_MODES } from "@/renderer/settings/constants";
import { Moon, Sun } from "lucide-react";

export function SiteHeader() {
  const {
    activeNote,
    activeFolder,
    folderWorkspaceOpen,
    openFolderWorkspace,
    themeMode,
    systemPrefersDark,
    handleThemeModeChange
  } = useApp();
  const noteTitle = activeNote?.title?.trim() || "New Note";
  const folderName = activeFolder?.name?.trim() || "";
  const isFolderContext = Boolean(
    activeFolder && activeNote && activeNote.folderId && activeNote.folderId === activeFolder.id
  );
  const handleFolderClick = () => {
    if (!activeFolder?.id) return;
    openFolderWorkspace(activeFolder.id);
  };
  const tone = themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;
  const toneLabel = tone === "dark" ? "Dark" : "Light";
  const modeLabel = themeMode === "system" ? `${toneLabel} (system)` : toneLabel;
  const themeModeIndex = THEME_MODES.indexOf(themeMode);
  const currentModeIndex = themeModeIndex === -1 ? 0 : themeModeIndex;
  const nextThemeMode = THEME_MODES[(currentModeIndex + 1) % THEME_MODES.length];
  const nextThemeLabel = THEME_LABELS[nextThemeMode] || nextThemeMode;
  const iconKey = themeMode === "system" ? "system" : tone === "dark" ? "dark" : "light";
  const ThemeIcons = { system: function System() { return 'System' }, dark: Moon, light: Sun };
  const CurrentThemeIcon = ThemeIcons[iconKey] || Sun;

  const handleSwitchChange = () => {
    handleThemeModeChange(nextThemeMode);
  };

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-2 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-1">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <h1 className="text-base font-medium">
            {isFolderContext ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFolderClick}
                  className="text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
                >
                  {folderName}
                </button>
                <span className="text-base font-semibold uppercase tracking-wide text-muted-foreground">/</span>
                <span>{noteTitle}</span>
              </span>
            ) : folderWorkspaceOpen && activeFolder ? (
              <button
                type="button"
                onClick={handleFolderClick}
                className="text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
              >
                {folderName}
              </button>
            ) : (
              noteTitle
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-sm">
            <CurrentThemeIcon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{modeLabel}</span>
          </span>
          <Switch
            checked={tone === "dark"}
            onCheckedChange={handleSwitchChange}
            aria-label={`Switch to ${nextThemeLabel} mode`}
          />
        </div>
      </div>
    </header>
  );
}
