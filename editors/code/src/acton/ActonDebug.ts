//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

import * as child_process from "node:child_process"
import * as net from "node:net"

import * as vscode from "vscode"

import {Acton} from "./Acton"
import {ActonCommand} from "./ActonCommand"

const DEBUG_HOST = "127.0.0.1"
const DEBUG_READY_TIMEOUT_MS = 120_000
const LEGACY_DAP_ENV = "ACTON_DEBUG_DAP_USE_LEGACY_VALUE"

const outputChannels: Map<string, vscode.OutputChannel> = new Map()

interface StartActonDebuggingOptions {
    readonly createCommand: (port: number) => ActonCommand
    readonly outputChannelName: string
    readonly sessionName: string
    readonly waitForTermination?: boolean
    readonly workingDir: string
    readonly workspaceFolder?: vscode.WorkspaceFolder
}

export async function startActonDebugging(options: StartActonDebuggingOptions): Promise<void> {
    const port = await getFreePort()
    const command = options.createCommand(port)
    const channel = getOutputChannel(options.outputChannelName)
    const actonProcess = Acton.getInstance().spawnProcess(command, options.workingDir, {
        ...process.env,
        [LEGACY_DAP_ENV]: "1",
    })

    channel.appendLine(`> ${LEGACY_DAP_ENV}=1 acton ${renderArguments(command)}`)

    try {
        await waitForDebugServer(actonProcess, port, channel)
    } catch (error) {
        stopProcess(actonProcess)
        channel.show(true)
        throw error
    }

    let resolveTermination: (() => void) | undefined
    const terminationPromise: Promise<void> = new Promise(resolve => {
        resolveTermination = resolve
    })

    const terminateSubscription = vscode.debug.onDidTerminateDebugSession(session => {
        if (
            session.type === "acton" &&
            session.configuration.port === port &&
            session.name === options.sessionName
        ) {
            terminateSubscription.dispose()
            stopProcess(actonProcess)
            resolveTermination?.()
        }
    })

    let success = false
    try {
        success = await vscode.debug.startDebugging(options.workspaceFolder, {
            type: "acton",
            name: options.sessionName,
            request: "launch",
            host: DEBUG_HOST,
            port,
        })
    } catch (error) {
        terminateSubscription.dispose()
        stopProcess(actonProcess)
        channel.show(true)
        throw error
    }

    if (!success) {
        terminateSubscription.dispose()
        stopProcess(actonProcess)
        channel.show(true)
        throw new Error("Failed to start the Acton debug session.")
    }

    if (options.waitForTermination) {
        await terminationPromise
    }
}

function renderArguments(command: ActonCommand): string {
    const args = command.getArguments()
    if (args.length === 0) {
        return command.name
    }

    return `${command.name} ${args.join(" ")}`
}

function getOutputChannel(name: string): vscode.OutputChannel {
    const existing = outputChannels.get(name)
    if (existing) {
        return existing
    }

    const created = vscode.window.createOutputChannel(name)
    outputChannels.set(name, created)
    return created
}

async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer()

        server.once("error", reject)
        server.listen(0, DEBUG_HOST, () => {
            const address = server.address()
            if (!address || typeof address === "string") {
                server.close()
                reject(new Error("Failed to allocate a local debug port."))
                return
            }

            server.close(closeError => {
                if (closeError) {
                    reject(closeError)
                    return
                }

                resolve(address.port)
            })
        })
    })
}

async function waitForDebugServer(
    actonProcess: child_process.ChildProcessWithoutNullStreams,
    port: number,
    channel: vscode.OutputChannel,
): Promise<void> {
    const readinessMarkers = [
        `Debugger server listening on ${DEBUG_HOST}:${port}`,
        `Retrace DAP listening on ${DEBUG_HOST}:${port}`,
    ]

    return new Promise((resolve, reject) => {
        let isSettled = false
        let transcript = ""

        const cleanup = (): void => {
            clearTimeout(timeout)
            actonProcess.stdout.off("data", onStdout)
            actonProcess.stderr.off("data", onStderr)
            actonProcess.off("close", onClose)
            actonProcess.off("error", onError)
        }

        const finish = (callback: () => void): void => {
            if (isSettled) {
                return
            }

            isSettled = true
            cleanup()
            callback()
        }

        const append = (chunk: Buffer): void => {
            const text = chunk.toString()
            transcript += text
            channel.append(text)

            if (readinessMarkers.some(marker => transcript.includes(marker))) {
                finish(resolve)
            }
        }

        const onStdout = (chunk: Buffer): void => {
            append(chunk)
        }

        const onStderr = (chunk: Buffer): void => {
            append(chunk)
        }

        const onClose = (code: number | null): void => {
            finish(() => {
                reject(new Error(buildStartupFailureMessage(code, transcript)))
            })
        }

        const onError = (error: Error): void => {
            finish(() => {
                reject(error)
            })
        }

        const timeout = setTimeout(() => {
            finish(() => {
                reject(new Error(buildStartupTimeoutMessage(port, transcript)))
            })
        }, DEBUG_READY_TIMEOUT_MS)

        actonProcess.stdout.on("data", onStdout)
        actonProcess.stderr.on("data", onStderr)
        actonProcess.once("close", onClose)
        actonProcess.once("error", onError)
    })
}

function buildStartupFailureMessage(code: number | null, transcript: string): string {
    const exitCode = code === null ? "unknown" : String(code)
    const details = transcript.trim()

    if (details === "") {
        return `Acton debug failed before the debug adapter became ready (code=${exitCode}).`
    }

    return `Acton debug failed before the debug adapter became ready (code=${exitCode}).\n\n${details}`
}

function buildStartupTimeoutMessage(port: number, transcript: string): string {
    const details = transcript.trim()

    if (details === "") {
        return `Timed out waiting for Acton to listen on ${DEBUG_HOST}:${port}.`
    }

    return `Timed out waiting for Acton to listen on ${DEBUG_HOST}:${port}.\n\n${details}`
}

function stopProcess(actonProcess: child_process.ChildProcessWithoutNullStreams): void {
    if (actonProcess.killed || actonProcess.exitCode !== null) {
        return
    }

    actonProcess.kill()
}
