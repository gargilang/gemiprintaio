"use client";

import { useState, useRef, useEffect } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  emptyText = "Tidak ada data",
  className = "",
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]);

  useClickOutside(
    containerRef,
    () => {
      setIsOpen(false);
      setSearchQuery("");
    },
    isOpen
  );

  // Filter options based on search
  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value);
  const selectedLabel = selectedOption?.label || "";

  const handleInputClick = () => {
    if (!disabled) {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearchQuery("");
      setHighlightedIndex(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (filteredOptions.length > 0) {
        const nextIndex = Math.min(
          highlightedIndex + 1,
          filteredOptions.length - 1
        );
        setHighlightedIndex(nextIndex);
        // Scroll option into view
        optionsRef.current[nextIndex]?.scrollIntoView({
          block: "nearest",
        });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && filteredOptions.length > 0) {
        const prevIndex = Math.max(highlightedIndex - 1, 0);
        setHighlightedIndex(prevIndex);
        // Scroll option into view
        optionsRef.current[prevIndex]?.scrollIntoView({
          block: "nearest",
        });
      }
    } else if (e.key === "Enter" && highlightedIndex >= 0 && isOpen) {
      e.preventDefault();
      const selectedOption = filteredOptions[highlightedIndex];
      if (selectedOption) {
        handleSelect(selectedOption.value);
      }
    }
  };

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Inline Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery || (isOpen ? "" : selectedLabel)}
          onChange={handleInputChange}
          onClick={handleInputClick}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
            disabled
              ? "opacity-50 cursor-not-allowed bg-gray-100"
              : "cursor-pointer"
          } ${
            !searchQuery && !isOpen && selectedLabel ? "text-gray-900" : ""
          } ${
            !searchQuery && !isOpen && !selectedLabel ? "text-gray-400" : ""
          }`}
        />
        <svg
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform pointer-events-none ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-hidden">
          {/* Options List */}
          <div className="overflow-y-auto max-h-64">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.value}
                  ref={(el) => {
                    optionsRef.current[index] = el;
                  }}
                  role="option"
                  tabIndex={0}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSelect(option.value);
                  }}
                  className={`px-4 py-2 text-sm cursor-pointer transition-colors ${
                    option.value === value
                      ? "bg-indigo-100 text-indigo-700 font-semibold"
                      : index === highlightedIndex
                      ? "bg-gray-200"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
