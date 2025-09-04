import {defineConfig} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@shared": path.resolve(__dirname, "../../../shared/src"),
        },
    },
    css: {
        modules: {
            localsConvention: "camelCase",
        },
    },
    build: {
        outDir: "dist",
        assetsDir: "assets",
        sourcemap: false,
        rollupOptions: {
            input: "index.html",
            output: {
                entryFileNames: "assets/main.js",
                chunkFileNames: "assets/chunk-[name].js",
                assetFileNames: asset => {
                    if (asset.names && asset.names.every(it => it.endsWith(".css"))) {
                        return "assets/main.css"
                    }
                    return "assets/[name][extname]"
                },
            },
        },
    },
})
