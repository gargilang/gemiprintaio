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
  const [activeTab, setActiveTab] = useState<TabType>(
    tabParam === "setup" ||
      tabParam === "company" ||
      tabParam === "system" ||
      tabParam === "ppn" ||
      tabParam === "period"
      ? (tabParam as TabType)
      : tabParam === "materials"
      ? "setup"
      : "system"
  );

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
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 h-12 rounded-lg font-semibold transition-all duration-200
                flex items-center justify-center gap-2
                whitespace-nowrap text-sm
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

      {/* Tab Content - semua tab tetap mounted (CSS hidden) agar tidak re-fetch
          setiap kali user pindah tab. */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <div className={activeTab === "system" ? undefined : "hidden"}><SystemTab /></div>
        <div className={activeTab === "company" ? undefined : "hidden"}><CompanyTab /></div>
        <div className={activeTab === "setup" ? undefined : "hidden"}><SetupTab /></div>
        <div className={activeTab === "ppn" ? undefined : "hidden"}><PpnTab /></div>
        <div className={activeTab === "period" ? undefined : "hidden"}><PeriodCloseTab /></div>
      </div>
    </div>
  );
}
