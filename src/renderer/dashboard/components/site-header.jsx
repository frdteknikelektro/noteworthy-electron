import { Separator } from "@/renderer/components/ui/separator";
import { SidebarTrigger } from "@/renderer/components/ui/sidebar";
import { Switch } from "@/renderer/components/ui/switch";
import { useApp } from "@/renderer/app-provider";
import { THEME_ICONS } from "@/renderer/settings/constants";

export function SiteHeader() {
  const { activeNote, themeMode, systemPrefersDark, handleThemeModeChange } = useApp();
  const title = activeNote?.title?.trim() || "New Note";
  const tone = themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;
  const toneLabel = tone === "dark" ? "Dark" : "Light";
  const modeLabel = themeMode === "system" ? `${toneLabel} (system)` : toneLabel;
  const icon = THEME_ICONS[themeMode === "system" ? "system" : tone] || (tone === "dark" ? "🌙" : "☀️");

  const handleSwitchChange = checked => {
    handleThemeModeChange(checked ? "dark" : "light");
  };

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-2 px-4 lg:gap-2 lg:px-6">
        <div className="flex items-center gap-1">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <h1 className="text-base font-medium">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-sm">
            <span className="text-base leading-4">{icon}</span>
            <span>{modeLabel}</span>
          </span>
          <Switch
            checked={tone === "dark"}
            onCheckedChange={handleSwitchChange}
            aria-label="Toggle dark/light mode"
          />
        </div>
      </div>
    </header>
  );
}
