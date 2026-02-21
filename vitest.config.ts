import path from "node:path"

import {defineConfig} from "vitest/config"

export default defineConfig({
    resolve: {
        alias: {
            "@server": path.resolve(__dirname, "server/src"),
            "@shared": path.resolve(__dirname, "shared/src"),
        },
    },
    test: {
        globals: true,
        include: [
            "server/src/**/*.{test,spec}.{ts,tsx}",
            "editors/code/src/**/*.{test,spec}.{ts,tsx}",
        ],
        exclude: ["**/e2e/**", "**/node_modules/**"],
    },
})
