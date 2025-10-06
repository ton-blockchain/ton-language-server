import * as vscode from "vscode"
import {WebSocket, Server} from "ws"

import {TestDataMessage} from "./test-types"

export class WebSocketServer {
    private wss: Server | null = null
    private disposables: vscode.Disposable[] = []
    private testWebviewProvider?: {addTestData: (data: TestDataMessage) => void}

    public constructor(
        private readonly port: number = Number.parseInt(
            process.env.VSCODE_WEBSOCKET_PORT ?? "7743",
            10,
        ),
    ) {}

    public setTestWebviewProvider(provider: {addTestData: (data: TestDataMessage) => void}): void {
        this.testWebviewProvider = provider
    }

    public start(): void {
        try {
            this.wss = new Server({port: this.port})

            this.wss.on("connection", (ws: WebSocket) => {
                console.log("Blockchain WebSocket connected")

                ws.on("message", (data: Buffer) => {
                    try {
                        const message = JSON.parse(data.toString()) as TestDataMessage

                        this.handleTestData(message)
                    } catch (error) {
                        console.error("Failed to parse WebSocket message:", error)
                    }
                })

                ws.on("close", () => {
                    console.log("Blockchain WebSocket disconnected")
                })

                ws.on("error", error => {
                    console.error("WebSocket error:", error)
                })
            })

            this.wss.on("error", error => {
                console.error("WebSocket Server error:", error)
            })

            console.log(`WebSocket server started on port ${this.port}`)
        } catch (error) {
            console.error("Failed to start WebSocket server:", error)
        }
    }

    private handleTestData(message: TestDataMessage): void {
        this.testWebviewProvider?.addTestData(message)
    }

    public stop(): void {
        if (this.wss) {
            this.wss.close()
            this.wss = null
            console.log("WebSocket server stopped")
        }

        this.disposables.forEach(d => {
            d.dispose()
        })
        this.disposables = []
    }

    public dispose(): void {
        this.stop()
    }
}
