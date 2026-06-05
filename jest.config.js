const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/src/__mocks__/server-only.js",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  // Ratchet konservatif (O-I3): dipasang sedikit DI BAWAH coverage saat ini
  // supaya `test:coverage` gagal kalau coverage TURUN, tanpa langsung merah.
  // Mayoritas src/ (UI + route) belum ditest di branch ini; Fase 4 menambah
  // test API + jsdom lalu angka ini dinaikkan.
  coverageThreshold: {
    global: {
      statements: 7,
      branches: 5,
      functions: 5,
      lines: 7,
    },
  },
};
