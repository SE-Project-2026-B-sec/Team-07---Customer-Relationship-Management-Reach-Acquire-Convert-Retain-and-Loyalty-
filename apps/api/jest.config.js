/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  // NFR CRM-NF-006: backend line coverage must stay at or above 70%.
  coverageThreshold: { global: { lines: 70 } },
};
