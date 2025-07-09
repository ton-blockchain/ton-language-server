//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Core
import {File} from "@server/psi/File"

export class FuncFile extends File {
    public get fromStdlib(): boolean {
        return this.uri.includes("stdlib.fc")
    }

    public get fromStubs(): boolean {
        return this.uri.endsWith("stubs.fc")
    }
}
