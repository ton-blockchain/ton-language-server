//  SPDX-License-Identifier: MIT
//  Copyright © 2025 TON Studio
export function generateExitCodeDocumentation(code: number): string | null {
    const info = DATA[code]
    if (!info) return null

    return `${info.description}

**Phase**: ${info.origin}

Learn more about exit codes in documentation: https://docs.ton.org/v3/documentation/tvm/tvm-exit-codes`
}

export const DATA: Record<number, {origin: string; description: string} | undefined> = {
    "0": {
        origin: "Compute and action phases",
        description: "Standard successful execution exit code.",
    },
    "1": {
        origin: "Compute phase",
        description: "Alternative successful execution exit code. Reserved, but doesn’t occur.",
    },
    "2": {origin: "Compute phase", description: "Stack underflow."},
    "3": {origin: "Compute phase", description: "Stack overflow."},
    "4": {origin: "Compute phase", description: "Integer overflow."},
    "5": {
        origin: "Compute phase",
        description: "Range check error — some integer is out of its expected range.",
    },
    "6": {origin: "Compute phase", description: "Invalid TVM opcode."},
    "7": {origin: "Compute phase", description: "Type check error."},
    "8": {origin: "Compute phase", description: "Cell overflow."},
    "9": {origin: "Compute phase", description: "Cell underflow."},
    "10": {origin: "Compute phase", description: "Dictionary error."},
    "11": {
        origin: "Compute phase",
        description: "Described in TVM docs as “Unknown error, may be thrown by user programs”.",
    },
    "12": {
        origin: "Compute phase",
        description: "Fatal error. Thrown by TVM in situations deemed impossible.",
    },
    "13": {origin: "Compute phase", description: "Out of gas error."},
    "-14": {
        origin: "Compute phase",
        description: "Same as 13. Negative, so that it cannot be faked.",
    },
    "14": {
        origin: "Compute phase",
        description: "VM virtualization error. Reserved, but never thrown.",
    },
    "32": {origin: "Action phase", description: "Action list is invalid."},
    "33": {origin: "Action phase", description: "Action list is too long."},
    "34": {origin: "Action phase", description: "Action is invalid or not supported."},
    "35": {origin: "Action phase", description: "Invalid source address in outbound message."},
    "36": {origin: "Action phase", description: "Invalid destination address in outbound message."},
    "37": {origin: "Action phase", description: "Not enough Toncoin."},
    "38": {origin: "Action phase", description: "Not enough extra currencies."},
    "39": {
        origin: "Action phase",
        description: "Outbound message does not fit into a cell after rewriting.",
    },
    "40": {
        origin: "Action phase",
        description:
            "Cannot process a message — not enough funds, the message is too large or its Merkle depth is too big.",
    },
    "41": {
        origin: "Action phase",
        description: "Library reference is null during library change action.",
    },
    "42": {origin: "Action phase", description: "Library change action error."},
    "43": {
        origin: "Action phase",
        description:
            "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree.",
    },
    "50": {origin: "Action phase", description: "Account state size exceeded limits."},
}
