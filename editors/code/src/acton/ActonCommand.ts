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

export class WrapperCommand extends ActonCommand {
    public constructor(
        public contractId: string,
        public typescript: boolean = false,
    ) {
        super("wrapper")
    }

    public override getArguments(): string[] {
        const args: string[] = []
        if (this.typescript) args.push("--ts")
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
        public debug: boolean = false,
        public debugPort: string = "",
        public ui: boolean = false,
        public uiPort: string = "",
        public reporter: string = "console,teamcity",
    ) {
        super("test")
    }

    public override getArguments(): string[] {
        const args: string[] = ["--color", "always"]
        if (this.reporter.trim() !== "") {
            args.push("--reporter", this.reporter)
        }
        if (this.clearCache) args.push("--clear-cache")
        if (this.coverage) {
            args.push("--coverage", "--coverage-format", this.coverageFormat)
            if (this.coverageFile.trim() !== "") {
                args.push("--coverage-file", this.coverageFile)
            }
        }
        if (this.debug) {
            args.push("--debug")
            if (this.debugPort.trim() !== "") {
                args.push("--debug-port", this.debugPort)
            }
        }
        if (this.ui) {
            args.push("--ui")
            if (this.uiPort.trim() !== "") {
                args.push("--ui-port", this.uiPort)
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
        public broadcastNet: string = "",
        public explorer: string = "",
        public debug: boolean = false,
        public debugPort: string = "",
    ) {
        super("script")
    }

    public override getArguments(): string[] {
        const args: string[] = ["--color", "always"]
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
        if (this.broadcastNet.trim() !== "") {
            args.push("--net", this.broadcastNet)
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

export class RetraceCommand extends ActonCommand {
    public constructor(
        public hash: string,
        public net: string = "",
        public apiKey: string = "",
        public verbose: boolean = false,
        public logsDir: string = "",
        public contractId: string = "",
        public debug: boolean = false,
        public debugPort: string = "",
    ) {
        super("retrace")
    }

    public override getArguments(): string[] {
        const args: string[] = ["--color", "always"]
        if (this.net.trim() !== "") {
            args.push("--net", this.net)
        }
        if (this.apiKey.trim() !== "") {
            args.push("--api-key", this.apiKey)
        }
        if (this.verbose) {
            args.push("--verbose")
        }
        if (this.logsDir.trim() !== "") {
            args.push("--logs-dir", this.logsDir)
        }
        if (this.contractId.trim() !== "") {
            args.push("--contract", this.contractId)
        }
        if (this.debug) {
            args.push("--debug")
            if (this.debugPort.trim() !== "") {
                args.push("--debug-port", this.debugPort)
            }
        }
        if (this.hash.trim() !== "") {
            args.push(this.hash)
        }
        return args
    }
}

export class CheckCommand extends ActonCommand {
    public constructor(
        public json: boolean = true,
        public target: string = "",
    ) {
        super("check")
    }

    public override getArguments(): string[] {
        const args: string[] = []
        if (this.json) {
            args.push("--output-format=json")
        }
        if (this.target.trim() !== "") {
            args.push(this.target)
        }
        return args
    }
}

export class FormatCommand extends ActonCommand {
    public constructor(public targets: readonly string[] = []) {
        super("fmt")
    }

    public override getArguments(): string[] {
        return this.targets.filter(target => target.trim() !== "")
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

export class WalletListCommand extends ActonCommand {
    public constructor(public balance: boolean = false) {
        super("wallet")
    }

    public override getArguments(): string[] {
        const args = ["list", "--json"]
        if (this.balance) args.push("--balance")
        return args
    }
}

export class WalletNewCommand extends ActonCommand {
    public constructor(
        public walletName: string,
        public version: string = "v5r1",
        public global: boolean = false,
        public secure: boolean = true,
    ) {
        super("wallet")
    }

    public override getArguments(): string[] {
        const args = ["new", "--json"]
        if (this.walletName.trim() !== "") {
            args.push("--name", this.walletName)
        }
        if (this.version.trim() !== "") {
            args.push("--version", this.version)
        }
        if (this.global) {
            args.push("--global")
        } else {
            args.push("--local")
        }
        args.push("--secure", this.secure.toString())
        return args
    }
}

export class WalletImportCommand extends ActonCommand {
    public constructor(
        public walletName: string,
        public mnemonic: string,
        public version: string = "v5r1",
        public global: boolean = false,
        public secure: boolean = true,
    ) {
        super("wallet")
    }

    public override getArguments(): string[] {
        const args = ["import", "--json"]
        if (this.walletName.trim() !== "") {
            args.push("--name", this.walletName)
        }
        if (this.version.trim() !== "") {
            args.push("--version", this.version)
        }
        if (this.global) {
            args.push("--global")
        } else {
            args.push("--local")
        }
        args.push("--secure", this.secure.toString())

        // Mnemonics are positional arguments at the end
        const mnemonics = this.mnemonic.split(/\s+/).filter(w => w.length > 0)
        args.push(...mnemonics)

        return args
    }
}

export class WalletAirdropCommand extends ActonCommand {
    public constructor(public walletName: string) {
        super("wallet")
    }

    public override getArguments(): string[] {
        return ["airdrop", this.walletName, "--json"]
    }
}
