//  SPDX-License-Identifier: MIT
//  Copyright © 2026 TON Core

export abstract class ActonCommand {
    protected constructor(public readonly name: string) {}

    public abstract getArguments(): string[]
}

export class BuildCommand extends ActonCommand {
    public constructor(
        public contractId: string = "",
        public clearCache: boolean = false,
        public outDir: string = "",
    ) {
        super("build")
    }

    public override getArguments(): string[] {
        const args: string[] = []
        if (this.clearCache) args.push("--clear-cache")
        if (this.outDir.trim() !== "") {
            args.push("--out-dir", this.outDir)
        }
        if (this.contractId.trim() !== "") {
            args.push(this.contractId)
        }
        return args
    }
}

export enum TestMode {
    FUNCTION = "FUNCTION",
    FILE = "FILE",
    DIRECTORY = "DIRECTORY",
}

export class TestCommand extends ActonCommand {
    public constructor(
        public mode: TestMode = TestMode.DIRECTORY,
        public target: string = "",
        public functionName: string = "",
        public clearCache: boolean = false,
        public coverage: boolean = false,
        public coverageFormat: string = "lcov",
        public coverageFile: string = "",
    ) {
        super("test")
    }

    public override getArguments(): string[] {
        const args: string[] = ["--reporter", "console"]
        if (this.clearCache) args.push("--clear-cache")
        if (this.coverage) {
            args.push("--coverage", "--coverage-format", this.coverageFormat)
            if (this.coverageFile.trim() !== "") {
                args.push("--coverage-file", this.coverageFile)
            }
        }

        switch (this.mode) {
            case TestMode.FUNCTION: {
                if (this.functionName.trim() !== "") {
                    args.push("--filter", this.functionName.replace(/`/g, ""))
                }
                if (this.target.trim() !== "") {
                    args.push(this.target)
                }
                break
            }
            case TestMode.FILE:
            case TestMode.DIRECTORY: {
                if (this.target.trim() !== "") {
                    args.push(this.target)
                }
                break
            }
        }
        return args
    }
}

export class ScriptCommand extends ActonCommand {
    public constructor(
        public scriptPath: string = "",
        public clearCache: boolean = false,
        public forkNet: string = "",
        public forkBlockNumber: string = "",
        public apiKey: string = "",
        public broadcast: boolean = false,
        public broadcastNet: string = "",
        public explorer: string = "",
        public debug: boolean = false,
        public debugPort: string = "",
    ) {
        super("script")
    }

    public override getArguments(): string[] {
        const args: string[] = []
        if (this.clearCache) args.push("--clear-cache")
        if (this.forkNet.trim() !== "") {
            args.push("--fork-net", this.forkNet)
        }
        if (this.forkBlockNumber.trim() !== "") {
            args.push("--fork-block-number", this.forkBlockNumber)
        }
        if (this.apiKey.trim() !== "") {
            args.push("--api-key", this.apiKey)
        }
        if (this.broadcast) {
            args.push("--broadcast")
            if (this.broadcastNet.trim() !== "") {
                args.push("--net", this.broadcastNet)
            }
            if (this.explorer.trim() !== "") {
                args.push("--explorer", this.explorer)
            }
        }
        if (this.debug) {
            args.push("--debug")
            if (this.debugPort.trim() !== "") {
                args.push("--debug-port", this.debugPort)
            }
        }
        if (this.scriptPath.trim() !== "") {
            args.push(this.scriptPath)
        }
        return args
    }
}

export class RunCommand extends ActonCommand {
    public constructor(public scriptName: string = "") {
        super("run")
    }

    public override getArguments(): string[] {
        const args: string[] = []
        if (this.scriptName.trim() !== "") {
            args.push(this.scriptName)
        }
        return args
    }
}

export class CustomCommand extends ActonCommand {
    public constructor(
        command: string,
        public args: string[] = [],
    ) {
        super(command)
    }

    public override getArguments(): string[] {
        return this.args
    }
}
