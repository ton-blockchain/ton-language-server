//@ts-check

"use strict"

const path = require("path")
const CopyPlugin = require("copy-webpack-plugin")
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin")
const webpack = require("webpack")

const distDir = path.resolve(__dirname, "dist")

/**@type {import("webpack").Configuration}*/
const config = {
    mode: "development",

    target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

    entry: {
        server: "./server/src/server.ts",
        client: "./client/src/extension.ts",
    }, // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: distDir,
        filename: "[name].js",
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: "source-map",
    externals: {
        vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },

    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            // provides alternate implementation for node module and source files
        },
        plugins: [new TsconfigPathsPlugin()],
        fallback: {},
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                    },
                ],
            },
        ],
    },
    plugins: [
        new webpack.BannerPlugin({
            banner: "#!/usr/bin/env node",
            raw: true,
            include: "server.js",
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: "./node_modules/web-tree-sitter/tree-sitter.wasm",
                    to: distDir,
                },
                {
                    from: "./server/src/languages/tolk/stubs/stubs.tolk",
                    to: path.join(distDir, "stubs"),
                },
                {
                    from: "./server/src/languages/tolk/tree-sitter-tolk/tree-sitter-tolk.wasm",
                    to: distDir,
                },
                {
                    from: "./server/src/languages/fift/tree-sitter-fift/tree-sitter-fift.wasm",
                    to: distDir,
                },
                {
                    from: "./server/src/languages/tlb/tree-sitter-tlb/tree-sitter-tlb.wasm",
                    to: distDir,
                },
                {
                    from: "./client/src/assets/icons/*",
                    to: path.join(distDir, "icons", "[name][ext]"),
                },
                {
                    from: "server/src/languages/fift/asm/asm.json",
                    to: distDir,
                },
                {
                    from: "./package.server.json",
                    to: path.join(distDir, "package.json"),
                },
                {
                    from: "./README.md",
                    to: path.join(distDir, "README.md"),
                },
            ],
        }),
    ],
}
module.exports = config
