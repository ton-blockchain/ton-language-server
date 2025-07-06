//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio

/* eslint-disable @typescript-eslint/no-base-to-string */
import type {Connection} from "vscode-languageserver"
import * as fs from "node:fs"
import * as path from "node:path"

export class Logger {
    private logFile: fs.WriteStream | null = null
    private static instance: Logger | null = null

    private constructor(
        private readonly connection: Connection,
        logPath?: string,
    ) {
        if (logPath !== undefined) {
            const logDir = path.dirname(logPath)
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, {recursive: true})
            }
            this.logFile = fs.createWriteStream(logPath, {flags: "a"})
        }
    }

    public static initialize(connection: Connection, logPath?: string): Logger {
        if (!Logger.instance) {
            const instance = new Logger(connection, logPath)

            console.log = (...args) => {
                instance.log(...args)
            }
            console.info = (...args) => {
                instance.info(...args)
            }
            console.warn = (...args) => {
                instance.warn(...args)
            }
            console.error = (...args) => {
                instance.error(...args)
            }

            Logger.instance = instance
        }
        return Logger.instance
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            throw new Error("Logger not initialized")
        }
        return Logger.instance
    }

    public log(...args: unknown[]): void {
        const message = Logger.formatMessage(args)
        this.connection.console.log(message)
        this.writeToFile(`[LOG] [${Logger.formatDate(new Date())}] ${message}`)
    }

    public info(...args: unknown[]): void {
        const message = Logger.formatMessage(args)
        this.connection.console.info(message)
        this.writeToFile(`[INFO] [${Logger.formatDate(new Date())}] ${message}`)
    }

    public warn(...args: unknown[]): void {
        const message = Logger.formatMessage(args)
        this.connection.console.warn(message)
        this.writeToFile(`[WARN] [${Logger.formatDate(new Date())}] ${message}`)
    }

    public error(...args: unknown[]): void {
        const message = Logger.formatMessage(args)
        this.connection.console.error(message)
        this.writeToFile(`[ERROR] [${Logger.formatDate(new Date())}] ${message}`)
    }

    public dispose(): void {
        if (this.logFile) {
            this.logFile.end()
            this.logFile = null
        }
    }

    private static formatDate(date: Date): string {
        const pad = (n: number): string => n.toString().padStart(2, "0")

        const year = date.getFullYear().toString()
        const month = pad(date.getMonth() + 1)
        const day = pad(date.getDate())
        const hours = pad(date.getHours())
        const minutes = pad(date.getMinutes())
        const seconds = pad(date.getSeconds())

        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
    }

    private static formatMessage(args: unknown[]): string {
        return args
            .filter(arg => arg !== undefined)
            .map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg.toString()))
            .join(" ")
    }

    private writeToFile(message: string): void {
        if (this.logFile) {
            this.logFile.write(message + "\n")
        }
    }
}
