"use client";

import Dashboard from "@/renderer/dashboard";
import SettingsModal from "@/renderer/dashboard/components/settings-modal";
import { AppProvider, useApp } from "./app-provider";
import { THEME_ICONS, THEME_LABELS } from "./settings/constants";

function AppContent() {
  const { themeMode, handleThemeToggle, openSettings } = useApp();
  const themeIcon = THEME_ICONS[themeMode] ?? THEME_ICONS.system;
  const themeLabel = THEME_LABELS[themeMode] ?? THEME_LABELS.system;

  return (
    <>
      <Dashboard
        themeIcon={themeIcon}
        themeLabel={themeLabel}
        onThemeToggle={handleThemeToggle}
        onOpenSettings={openSettings}
      />
      <SettingsModal />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
