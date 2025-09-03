//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
import {Cell} from "@ton/core"
import {runTolkCompiler} from "@ton/tolk-js"

export interface CompilationResult {
    readonly success: boolean
    readonly code?: string
    readonly error?: string
    readonly output?: string
}

export class TolkCompilerProvider {
    private static instance: TolkCompilerProvider | undefined

    public static getInstance(): TolkCompilerProvider {
        if (!TolkCompilerProvider.instance) {
            TolkCompilerProvider.instance = new TolkCompilerProvider()
        }
        return TolkCompilerProvider.instance
    }

    public async compileContract(contractCode: string): Promise<CompilationResult> {
        try {
            const cell = await this.compile(contractCode)
            return {
                success: true,
                output: "",
                code: cell.toBoc().toString("base64"),
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown compilation error",
            }
        }
    }

    public async compile(code: string): Promise<Cell> {
        const res = await runTolkCompiler({
            entrypointFileName: "main.tolk",
            fsReadCallback: () => code,
            withStackComments: true,
            withSrcLineComments: true,
        })
        if (res.status === "error") {
            throw new Error(res.message)
        }
        return Cell.fromBase64(res.codeBoc64)
    }
}
