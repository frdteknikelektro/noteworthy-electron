import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { SidebarTrigger } from "./ui/sidebar";

export function SiteHeader({ className = "", themeIcon, themeLabel, onThemeToggle }) {
  return (
    <header className={`flex flex-wrap items-center justify-between gap-4 ${className}`}>
      <div className="flex items-center gap-1">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Theme</span>
        <Button
          variant="ghost"
          type="button"
          className="gap-2 border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold tracking-wide shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
          onClick={onThemeToggle}
        >
          <span aria-hidden="true">{themeIcon}</span>
          <span>{themeLabel}</span>
        </Button>
      </div>
    </header>
  );
}
