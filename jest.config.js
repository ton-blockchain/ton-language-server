/** @type {import("ts-jest").JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/server/src", "<rootDir>/editors/code/src"],
    transform: {
        "^.+\\.tsx?$": "ts-jest",
    },
    moduleNameMapper: {
        "^@server/(.*)$": "<rootDir>/server/src/$1",
        "^@shared/(.*)$": "<rootDir>/shared/src/$1",
    },
    testPathIgnorePatterns: ["e2e/"],
    testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
}
