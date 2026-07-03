"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import PpnTab from "./PpnTab";
import PeriodCloseTab from "./PeriodCloseTab";
import NomorUrutTab from "./NomorUrutTab";
import { CompanyTab } from "./PengaturanTokoTab";
import { SetupTab } from "./PengaturanSetupTab";
import { SystemTab } from "./PengaturanSistemTab";

type TabType = "company" | "setup" | "system" | "ppn" | "period";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: TabType =
    tabParam === "setup" ||
    tabParam === "company" ||
    tabParam === "system" ||
    tabParam === "ppn" ||
    tabParam === "period"
      ? (tabParam as TabType)
      : tabParam === "materials"
        ? "setup"
        : "system";

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Lazy-mount (U-C3): hanya tab yang sudah pernah dibuka yang di-render. Saat
  // load awal hanya 1 tab yang mount (bukan 5 fetch paralel). Setelah dibuka,
  // tab tetap mounted (pakai CSS hidden) supaya state form yang belum disimpan
  // tidak hilang ketika pindah tab. Ditandai lewat onClick, bukan useEffect,
  // agar tidak memicu warning set-state-in-effect.
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(
    () => new Set<TabType>([initialTab]),
  );

  const selectTab = (id: TabType) => {
    setActiveTab(id);
    setVisitedTabs((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const tabs = [
    { id: "system" as TabType, label: "Sistem" },
    { id: "company" as TabType, label: "Data Usaha" },
    { id: "setup" as TabType, label: "Master Data" },
    { id: "ppn" as TabType, label: "PPN / Pajak" },
    { id: "period" as TabType, label: "Tutup Periode" },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-2">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className={`
                flex-1 px-4 h-12 rounded-lg font-semibold transition-all duration-200
                flex items-center justify-center gap-2
                whitespace-nowrap text-base
                ${
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-gray-500 to-gray-600 text-white shadow-md"
                    : "bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                }
              `}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content — lazy-mount: tab dirender setelah pertama kali dibuka,
          lalu tetap mounted (CSS hidden) supaya tidak re-fetch & tidak
          kehilangan input form yang belum disimpan saat pindah tab. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        {visitedTabs.has("system") && (
          <div className={activeTab === "system" ? undefined : "hidden"}>
            <SystemTab />
          </div>
        )}
        {visitedTabs.has("company") && (
          <div className={activeTab === "company" ? undefined : "hidden"}>
            <CompanyTab />
          </div>
        )}
        {visitedTabs.has("setup") && (
          <div className={activeTab === "setup" ? undefined : "hidden"}>
            <SetupTab />
          </div>
        )}
        {visitedTabs.has("ppn") && (
          <div className={activeTab === "ppn" ? undefined : "hidden"}>
            <PpnTab />
          </div>
        )}
        {visitedTabs.has("period") && (
          <div className={activeTab === "period" ? undefined : "hidden"}>
            <PeriodCloseTab />
          </div>
        )}
      </div>
    </div>
  );
}
