"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { BoxIcon } from "@/components/icons/ContentIcons";
import { HashIcon, PriceTagIcon, SparklesIcon } from "@/components/icons/PageIcons";
import NomorUrutTab from "./NomorUrutTab";
import { type Category } from "./setup/sortables";
import { CategoriesView } from "./setup/CategoriesView";
import { SubcategoriesView } from "./setup/SubcategoriesView";
import { UnitsSection } from "./setup/UnitsSection";
import { PricingTab, RollSizesTab, FinishingOptionsTab } from "./PengaturanHargaTab";


function SetupTab() {
  type SetupSubTab = "materials" | "pricing" | "finishing" | "rollsizes" | "nomorurut";
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const subtabParam = searchParams.get("subtab");
  const [activeSetupTab, setActiveSetupTab] = useState<SetupSubTab>(
    subtabParam === "materials" ||
      subtabParam === "pricing" ||
      subtabParam === "finishing" ||
      subtabParam === "rollsizes" ||
      subtabParam === "nomorurut"
      ? (subtabParam as SetupSubTab)
      : tabParam === "materials"
      ? "materials"
      : "nomorurut"
  );

  const setupTabs = [
    {
      id: "nomorurut" as SetupSubTab,
      label: "Nomor Urut",
      icon: HashIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "pricing" as SetupSubTab,
      label: "Harga",
      icon: PriceTagIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "rollsizes" as SetupSubTab,
      label: "Ukuran Roll",
      icon: BoxIcon,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      id: "materials" as SetupSubTab,
      label: "Master Barang",
      icon: BoxIcon,
      gradient: "from-emerald-500 to-teal-500",
    },
    {
      id: "finishing" as SetupSubTab,
      label: "Opsi Finishing",
      icon: SparklesIcon,
      gradient: "from-amber-700 to-amber-900",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs Navigation */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-2 border border-gray-200 dark:border-slate-800">
        <div className="flex gap-2">
          {setupTabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSetupTab(tab.id)}
                className={`
                  flex-1 px-4 py-3 rounded-lg font-semibold transition-all duration-200
                  flex items-center justify-center gap-2
                  ${
                    activeSetupTab === tab.id
                      ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md`
                      : "bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:bg-gray-100"
                  }
                `}
              >
                <IconComponent size={20} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab Content */}
      <div>
        {activeSetupTab === "pricing" && <PricingTab />}
        {activeSetupTab === "rollsizes" && <RollSizesTab />}
        {activeSetupTab === "materials" && <MaterialsTab />}
        {activeSetupTab === "finishing" && <FinishingOptionsTab />}
        {activeSetupTab === "nomorurut" && <NomorUrutTab />}
      </div>
    </div>
  );
}

function MaterialsTab() {
  const searchParams = useSearchParams();
  const manageParam = searchParams.get("manage");
  const openCategoryManager = manageParam === "category";
  const openUnitManager = manageParam === "unit";
  const [view, setView] = useState<"categories" | "subcategories">(
    "categories"
  );
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );

  const handleCategoryClick = (category: Category) => {
    setSelectedCategory(category);
    setView("subcategories");
  };

  const handleBackToCategories = () => {
    setSelectedCategory(null);
    setView("categories");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl">
          <BoxIcon size={32} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
            Master Kategori Bahan
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Kelola kategori, subkategori, spesifikasi, dan satuan bahan
          </p>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={handleBackToCategories}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
            view === "categories"
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold"
              : "text-gray-600 dark:text-slate-300 hover:bg-gray-100"
          }`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          Semua Kategori
        </button>
        {selectedCategory && (
          <>
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold rounded-lg">
              {selectedCategory.nama}
            </span>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 border-2 border-gray-200 dark:border-slate-800 min-h-[500px] min-w-[800px]">
        {view === "categories" ? (
          <CategoriesView
            onCategoryClick={handleCategoryClick}
            autoOpenModal={openCategoryManager}
          />
        ) : (
          <SubcategoriesView
            category={selectedCategory!}
          />
        )}
      </div>

      {/* Units Section - Always Visible */}
      <UnitsSection autoOpenModal={openUnitManager} />
    </div>
  );
}








export { SetupTab };
export default SetupTab;
