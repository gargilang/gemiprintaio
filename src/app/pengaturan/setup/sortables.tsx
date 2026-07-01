"use client";

import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Tipe master-data bersama + komponen baris sortable (drag-drop) untuk
// PengaturanSetupTab. Diekstrak di Fase 6 B1 — komponen props-only.

export interface Category {
  id: string;
  nama: string;
  urutan_tampilan: number;
}

export interface Subcategory {
  id: string;
  kategori_id: string;
  nama: string;
  category_name: string;
  urutan_tampilan: number;
}

export interface Unit {
  id: string;
  nama: string;
  urutan_tampilan?: number;
}

export interface QuickSpec {
  id: string;
  kategori_id: string;
  tipe_spesifikasi: string;
  nilai_spesifikasi: string;
  category_name: string;
  urutan_tampilan: number;
}

export function SortableCategory({
  category,
  index,
  onCategoryClick,
  onEdit,
  onDelete,
}: {
  category: Category;
  index: number;
  onCategoryClick: (category: Category) => void;
  onEdit: (e: React.MouseEvent, category: Category) => void;
  onDelete: (e: React.MouseEvent, category: Category) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-slate-800 dark:to-slate-800 rounded-xl p-4 border-2 border-emerald-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-slate-600 flex items-center justify-between group hover:shadow-lg transition-all text-left"
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-emerald-600 dark:text-emerald-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-emerald-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
          {index + 1}
        </div>

        {/* Category Info */}
        <div
          className="flex-1 cursor-pointer"
          onClick={() => onCategoryClick(category)}
        >
          <span className="font-semibold text-gray-800 dark:text-slate-100 block">
            {category.nama}
          </span>
          {(category as any).butuh_spesifikasi_status === 1 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-1 mt-1">
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Ada Spesifikasi
            </span>
          )}
        </div>

        {/* Arrow Icon */}
        <svg
          className="w-5 h-5 text-emerald-600 dark:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          onClick={() => onCategoryClick(category)}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
        <button
          onClick={(e) => onEdit(e, category)}
          className="p-2 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded-lg transition-colors"
          title="Edit"
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
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={(e) => onDelete(e, category)}
          className="p-2 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded-lg transition-colors"
          title="Hapus"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SortableSubcategory({
  subcategory,
  index,
  onEdit,
  onDelete,
}: {
  subcategory: Subcategory;
  index: number;
  onEdit: (subcategory: Subcategory) => void;
  onDelete: (subcategory: Subcategory) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subcategory.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-blue-50 dark:bg-slate-800 rounded-lg p-3 border-2 border-blue-200 dark:border-slate-700 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-blue-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <span className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-sm">
          {index + 1}
        </span>

        {/* Subcategory Name */}
        <span className="text-gray-800 dark:text-slate-100 font-semibold flex-1">
          {subcategory.nama}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(subcategory)}
          className="p-1.5 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(subcategory)}
          className="p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SortableUnit({
  unit,
  index,
  onEdit,
  onDelete,
}: {
  unit: Unit;
  index: number;
  onEdit: (unit: Unit) => void;
  onDelete: (unit: Unit) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: unit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-slate-800 dark:to-slate-800 rounded-lg p-3 border-2 border-orange-200 dark:border-slate-700 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-orange-600 dark:text-orange-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-orange-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
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
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Number Badge */}
        <span className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg flex items-center justify-center font-bold text-sm">
          {index + 1}
        </span>

        {/* Unit Name */}
        <span className="font-semibold text-gray-800 dark:text-slate-100 flex-1">
          {unit.nama}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(unit)}
          className="p-1.5 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(unit)}
          className="p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SortableQuickSpec({
  spec,
  onEdit,
  onDelete,
}: {
  spec: QuickSpec;
  onEdit: (spec: QuickSpec) => void;
  onDelete: (spec: QuickSpec) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: spec.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-slate-900 rounded-lg p-2 border border-purple-300 flex items-center justify-between group hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-purple-600 dark:text-purple-300 hover:bg-slate-50 dark:hover:bg-white/5 dark:bg-purple-900/30 rounded cursor-grab active:cursor-grabbing transition-colors"
          title="Drag untuk mengatur urutan"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>

        {/* Spec Value */}
        <span className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate flex-1">
          {spec.nilai_spesifikasi}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
        <button
          onClick={() => onEdit(spec)}
          className="p-1 text-blue-600 dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-blue-900/30 rounded transition-colors"
          title="Edit"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={() => onDelete(spec)}
          className="p-1 text-red-600 hover:bg-red-100 dark:bg-red-900/30 rounded transition-colors"
          title="Hapus"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
