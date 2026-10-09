/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  testMatch: ['**/*.test.mjs'],
  moduleFileExtensions: ['js', 'mjs'],
  transform: {},
  collectCoverageFrom: ['assets/js/**/*.js', '!assets/js/**/*.test.mjs'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};