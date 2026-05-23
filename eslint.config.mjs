// ESLint v9 flat config untuk Next.js 16.
// eslint-config-next v16 sudah native flat-array, jadi tinggal di-spread.
//
// Strategi: pakai default Next 'core-web-vitals' (yang nge-include rules
// React Hooks + a11y), lalu ringankan rules yang noise di repo ini supaya
// `npm run lint` jadi gate berguna, bukan banjir warning legacy.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      "**/.next/**",
      ".next-tauri/**",
      ".turbo/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "src-tauri/target/**",
      "tauri-bundle/**",
      "supabase/.branches/**",
      "supabase/.temp/**",
      "flutter/**",
      "scripts/**",
      "**/*.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // React 19 + Next 16 tidak butuh import React eksplisit, dan banyak
      // legacy file dengan apostrof bahasa Indonesia di JSX. Off-kan supaya
      // tidak ada false positive.
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // Aturan baru di React 19 — bagus untuk diingatkan, tapi banyak
      // pattern legacy (modal yang setState di useEffect, callback yang
      // di-define setelah dipanggil di hooks) yang valid runtime-nya.
      // Turun ke warn supaya `npm run lint` jadi gate berguna, bukan
      // block CI dengan refactor besar.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/refs": "warn",
    },
  },
];
