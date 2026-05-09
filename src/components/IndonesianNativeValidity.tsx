"use client";

import { useEffect } from "react";

/**
 * Browser default HTML5 validation tooltips follow the browser UI language and
 * often show English ("Please fill out this field."). This sets
 * setCustomValidity() on invalid → Indonesian messages. Cleared on input/change.
 */
function applyIndonesianMessage(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
) {
  el.setCustomValidity("");
  if (el.validity.valid) return;

  const v = el.validity;
  if (v.valueMissing) {
    el.setCustomValidity("Mohon isi kolom wajib ini.");
    return;
  }
  if (v.typeMismatch) {
    el.setCustomValidity(
      el.type === "email"
        ? "Masukkan alamat email yang valid."
        : "Format tidak valid."
    );
    return;
  }
  if (v.patternMismatch) {
    el.setCustomValidity("Format tidak sesuai.");
    return;
  }
  if (v.tooLong) {
    el.setCustomValidity("Nilai terlalu panjang.");
    return;
  }
  if (v.tooShort) {
    el.setCustomValidity("Nilai terlalu pendek.");
    return;
  }
  if (v.rangeUnderflow) {
    el.setCustomValidity("Nilai terlalu kecil.");
    return;
  }
  if (v.rangeOverflow) {
    el.setCustomValidity("Nilai terlalu besar.");
    return;
  }
  if (v.stepMismatch) {
    el.setCustomValidity("Nilai tidak sesuai langkah yang diizinkan.");
    return;
  }
  if (v.badInput) {
    el.setCustomValidity("Masukkan angka yang valid.");
    return;
  }
  el.setCustomValidity("Data tidak valid.");
}

export default function IndonesianNativeValidity() {
  useEffect(() => {
    const onInvalid = (e: Event) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        applyIndonesianMessage(t);
      }
    };

    const clearCustom = (e: Event) => {
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        t.setCustomValidity("");
      }
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", clearCustom, true);
    document.addEventListener("change", clearCustom, true);

    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", clearCustom, true);
      document.removeEventListener("change", clearCustom, true);
    };
  }, []);

  return null;
}
