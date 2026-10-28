/** Firefox E2E jest config: real Firefox ESR, one suite at a time,
 *  excluded from `npm test`. See harness.js.
 */
export default {
    testEnvironment: "node",
    transform: { "^.+\\.js$": "babel-jest" },
    moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
    testMatch: ["**/tests/e2e-firefox/scenarios/**/*.test.js"],
    testTimeout: 60_000,
    maxWorkers: 1,
};
