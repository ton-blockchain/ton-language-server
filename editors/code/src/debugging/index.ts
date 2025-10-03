import {DebugAdapterExecutable, DebugSession} from "vscode"
import * as vscode from "vscode"

export function configureDebugging(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider("tvm", {
            provideDebugConfigurations() {
                return [
                    {
                        type: "tvm",
                        name: "Debug",
                        request: "launch",
                        code: "${command:ton.getAssemblyCode}",
                        vmLogs: "${command:ton.getVmLogs}",
                        stopOnEntry: true,
                    },
                ]
            },
        }),
        vscode.debug.registerDebugAdapterDescriptorFactory("tvm", {
            createDebugAdapterDescriptor(_s: DebugSession, _e: DebugAdapterExecutable | undefined) {
                return new vscode.DebugAdapterServer(42_069)
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
