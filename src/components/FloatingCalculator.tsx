"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Operator = "+" | "-" | "*" | "/";

interface FloatingCalculatorProps {
  open: boolean;
  onClose: () => void;
}

const buttons = [
  "C",
  "⌫",
  "%",
  "÷",
  "7",
  "8",
  "9",
  "×",
  "4",
  "5",
  "6",
  "-",
  "1",
  "2",
  "3",
  "+",
  "0",
  "000",
  ".",
  "=",
];

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "Error";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 8,
  }).format(value);
}

function toPlainNumber(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function calculate(left: number, right: number, operator: Operator) {
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? Number.NaN : left / right;
  return right;
}

export default function FloatingCalculator({
  open,
  onClose,
}: FloatingCalculatorProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [position, setPosition] = useState(() => ({
    x: typeof window === "undefined" ? 24 : Math.max(8, window.innerWidth - 344),
    y: 88,
  }));
  const [display, setDisplay] = useState("0");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForNext, setWaitingForNext] = useState(false);
  const [history, setHistory] = useState("");

  const numericValue = useMemo(() => toPlainNumber(display), [display]);

  const clear = useCallback(() => {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setWaitingForNext(false);
    setHistory("");
  }, []);

  const inputDigit = useCallback((digit: string) => {
    if (waitingForNext) {
      setDisplay(digit === "." ? "0," : digit === "000" ? "0" : digit);
      setWaitingForNext(false);
      return;
    }
    if (digit === ".") {
      setDisplay((current) => (current.includes(",") ? current : `${current},`));
      return;
    }
    setDisplay((current) => {
      if (current === "0" && digit === "000") return "0";
      const normalized = current === "0" ? "" : current;
      return `${normalized}${digit}`;
    });
  }, [waitingForNext]);

  const applyOperator = useCallback((nextOperator: Operator) => {
    if (storedValue === null) {
      setStoredValue(numericValue);
      setHistory(`${formatNumber(numericValue)} ${nextOperator}`);
    } else if (operator) {
      const result = calculate(storedValue, numericValue, operator);
      setStoredValue(result);
      setDisplay(formatNumber(result));
      setHistory(`${formatNumber(result)} ${nextOperator}`);
    }
    setOperator(nextOperator);
    setWaitingForNext(true);
  }, [numericValue, operator, storedValue]);

  const equals = useCallback(() => {
    if (storedValue === null || !operator) return;
    const result = calculate(storedValue, numericValue, operator);
    setHistory(
      `${formatNumber(storedValue)} ${operator} ${formatNumber(numericValue)} =`
    );
    setDisplay(formatNumber(result));
    setStoredValue(null);
    setOperator(null);
    setWaitingForNext(true);
  }, [numericValue, operator, storedValue]);

  const percent = useCallback(() => {
    const result =
      storedValue !== null && operator
        ? (storedValue * numericValue) / 100
        : numericValue / 100;
    setDisplay(formatNumber(result));
  }, [numericValue, operator, storedValue]);

  const backspace = useCallback(() => {
    if (waitingForNext) return;
    setDisplay((current) => (current.length <= 1 ? "0" : current.slice(0, -1)));
  }, [waitingForNext]);

  const handleInput = useCallback((value: string) => {
    if (/^\d+$/.test(value) || value === ".") {
      inputDigit(value);
      return;
    }
    if (value === "C") clear();
    if (value === "⌫") backspace();
    if (value === "%") percent();
    if (value === "+") applyOperator("+");
    if (value === "-") applyOperator("-");
    if (value === "×") applyOperator("*");
    if (value === "÷") applyOperator("/");
    if (value === "=") equals();
  }, [applyOperator, backspace, clear, equals, inputDigit, percent]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleInput(event.key);
      } else if (event.key === ".") {
        event.preventDefault();
        handleInput(".");
      } else if (["+", "-", "*", "/"].includes(event.key)) {
        event.preventDefault();
        handleInput(
          event.key === "*" ? "×" : event.key === "/" ? "÷" : event.key
        );
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        handleInput("=");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleInput("⌫");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, handleInput]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const nextX = state.originX + event.clientX - state.startX;
    const nextY = state.originY + event.clientY - state.startY;
    setPosition({
      x: Math.max(8, Math.min(nextX, window.innerWidth - 328)),
      y: Math.max(8, Math.min(nextY, window.innerHeight - 460)),
    });
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
    }
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-80 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Kalkulator"
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="cursor-move px-4 py-3 bg-gradient-to-r from-[#0a1b3d] to-[#123b7a] text-white flex items-center justify-between"
      >
        <div>
          <h2 className="font-bold leading-tight">Kalkulator</h2>
        </div>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center"
          aria-label="Tutup kalkulator"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-xl bg-slate-950 text-right p-4 min-h-[92px] flex flex-col justify-end">
          <div className="text-xs text-slate-400 min-h-5 truncate">
            {history || "Siap menghitung"}
          </div>
          <div className="text-3xl font-bold text-white tabular-nums break-all">
            {display}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {buttons.map((button) => {
            const isOperator = ["÷", "×", "-", "+", "="].includes(button);
            const isUtility = ["C", "⌫", "%"].includes(button);
            return (
              <button
                key={button}
                type="button"
                onClick={() => handleInput(button)}
                className={`h-12 rounded-lg font-bold transition-colors ${
                  isOperator
                    ? "bg-[#00afef] hover:bg-[#0098d0] text-white"
                    : isUtility
                    ? "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100"
                    : "bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100"
                }`}
              >
                {button}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
