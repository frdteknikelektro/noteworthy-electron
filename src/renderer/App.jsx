"use client";

import Dashboard from "@/renderer/dashboard";
import SettingsModal from "@/renderer/dashboard/components/settings-modal";
import { AppProvider } from "./app-provider";

function AppContent() {
  return (
    <>
      <Dashboard />
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
