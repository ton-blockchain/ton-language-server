//@ts-check

"use strict"

const path = require("path")
const CopyPlugin = require("copy-webpack-plugin")
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin")
const webpack = require("webpack")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")

const distDir = path.resolve(__dirname, "dist")

/**@type {import("webpack").Configuration}*/
const extensionConfig = {
    mode: "development",

    target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target

    entry: {
        server: "./server/src/server.ts",
        client: "./editors/code/src/extension.ts",
        "debugging/adapter/server": "./editors/code/src/debugging/adapter/server.ts",
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
        plugins: [new TsconfigPathsPlugin.TsconfigPathsPlugin()],
        fallback: {
            buffer: require.resolve("buffer"),
        },
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
        new webpack.ProvidePlugin({
            Buffer: ["buffer", "Buffer"],
        }),
        new webpack.BannerPlugin({
            banner: "#!/usr/bin/env node",
            raw: true,
            include: ["server.js", "debugging/adapter/server.js"],
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
                    from: "./server/src/languages/func/stubs/stubs.fc",
                    to: path.join(distDir, "stubs"),
                },
                {
                    from: "./server/src/languages/tolk/tree-sitter-tolk/tree-sitter-tolk.wasm",
                    to: distDir,
                },
                {
                    from: "./server/src/languages/func/tree-sitter-func/tree-sitter-func.wasm",
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
                    from: "./editors/code/src/assets/icons/*",
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

/**@type {import("webpack").Configuration}*/
const webviewConfig = {
    mode: "development",
    target: "web",
    entry: {
        main: "./editors/code/src/webview-ui/src/main.tsx",
        "transaction-details": "./editors/code/src/webview-ui/src/transaction-details.tsx",
    },
    output: {
        path: path.join(distDir, "webview-ui"),
        filename: "[name].js",
        clean: false,
    },
    devtool: "source-map",
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: {
            "@shared": path.resolve(__dirname, "shared/src"),
        },
        fallback: {
            buffer: require.resolve("buffer"),
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            configFile: path.resolve(__dirname, "tsconfig.json"),
                            compilerOptions: {
                                jsx: "react-jsx",
                                lib: ["ES2020", "DOM"],
                                moduleResolution: "node",
                                esModuleInterop: true,
                                allowSyntheticDefaultImports: true,
                                strict: false,
                            },
                        },
                    },
                ],
            },
            {
                test: /\.module\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    {
                        loader: "css-loader",
                        options: {
                            modules: {
                                localIdentName: "[name]__[local]___[hash:base64:5]",
                                exportGlobals: true,
                                namedExport: false,
                            },
                        },
                    },
                ],
            },
            {
                test: /\.css$/,
                exclude: /\.module\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
            },
        ],
    },
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ["buffer", "Buffer"],
        }),
        new MiniCssExtractPlugin({
            filename: "[name].css",
        }),
    ],
    externals: {
        // React and ReactDOM will be available globally in the webview
        // but we need to bundle them for the webview context
    },
}

module.exports = [extensionConfig, webviewConfig]
