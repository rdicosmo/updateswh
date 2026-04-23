/** E2E jest config — separate from the unit config. Runs slower suites
 *  against a real Chromium, one at a time, excluded from `npm test`.
 */
export default {
    testEnvironment: "node",
    transform: { "^.+\\.js$": "babel-jest" },
    moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
    testMatch: ["**/tests/e2e/scenarios/**/*.test.js"],
    testTimeout: 30_000,
    maxWorkers: 1,
};
