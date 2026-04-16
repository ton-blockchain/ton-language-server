import * as vscode from "vscode"
import {DebugAdapterExecutable, DebugSession} from "vscode"

export function configureDebugging(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider("tvm", {
            provideDebugConfigurations() {
                return [
                    {
                        type: "tvm",
                        name: "Debug",
                        request: "launch",
                    },
                ]
            },
        }),
        vscode.debug.registerDebugAdapterDescriptorFactory("tvm", {
            createDebugAdapterDescriptor(_s: DebugSession, _e: DebugAdapterExecutable | undefined) {
                return new vscode.DebugAdapterServer(42_069)
            },
        }),
        vscode.debug.registerDebugConfigurationProvider("acton", {
            resolveDebugConfiguration(
                _folder: vscode.WorkspaceFolder | undefined,
                config: vscode.DebugConfiguration,
            ) {
                const port = Number(config.port)
                if (!Number.isInteger(port) || port <= 0) {
                    void vscode.window.showErrorMessage(
                        "Acton debug configuration requires a valid TCP port.",
                    )
                    return undefined
                }

                return {
                    ...config,
                    host:
                        typeof config.host === "string" && config.host.trim() !== ""
                            ? config.host
                            : "127.0.0.1",
                    port,
                    request:
                        typeof config.request === "string" && config.request.trim() !== ""
                            ? config.request
                            : "launch",
                }
            },
        }),
        vscode.debug.registerDebugAdapterDescriptorFactory("acton", {
            createDebugAdapterDescriptor(
                session: DebugSession,
                _e: DebugAdapterExecutable | undefined,
            ) {
                const port = Number(session.configuration.port)
                const host = String(session.configuration.host ?? "127.0.0.1")
                return new vscode.DebugAdapterServer(port, host)
            },
        }),
        vscode.commands.registerCommand("ton.debug", () => {
            void vscode.debug.startDebugging(undefined, {
                type: "tvm",
                name: "Debug",
                request: "launch",
            })
        }),
    )
}
