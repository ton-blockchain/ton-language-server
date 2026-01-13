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
