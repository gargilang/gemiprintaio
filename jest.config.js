const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

const common = {
  transform: { ...tsJestTransformCfg },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^server-only$": "<rootDir>/src/__mocks__/server-only.js",
  },
};

/** @type {import("jest").Config} **/
module.exports = {
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
  // Ratchet konservatif (O-I3). Mayoritas src/ (UI + route) belum ditest;
  // dinaikkan bertahap saat coverage tumbuh.
  coverageThreshold: {
    global: {
      statements: 7,
      branches: 5,
      functions: 5,
      lines: 7,
    },
  },
  projects: [
    {
      ...common,
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/src/lib/**/__tests__/**/*.test.ts",
        "<rootDir>/src/app/**/__tests__/**/*.test.ts",
      ],
    },
    {
      ...common,
      displayName: "jsdom",
      testEnvironment: "jsdom",
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
      testMatch: [
        "<rootDir>/src/components/**/__tests__/**/*.test.tsx",
        "<rootDir>/src/app/**/__tests__/**/*.test.tsx",
      ],
    },
  ],
};
