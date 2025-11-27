import {parseCallStack, CallStackEntry} from "./call-stack-parser"

describe("Parse Call Stack", () => {
    it("should parse empty call stack", () => {
        expect(parseCallStack(undefined)).toEqual([])
        expect(parseCallStack("")).toEqual([])
        expect(parseCallStack("no stack traces")).toEqual([])
    })

    it("should parse call stack from user example", () => {
        const callStack = `Error:
    at /root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js:294:24
    at AsyncLock.with (/root/node_modules/ton-sandbox-server-dev/dist/utils/AsyncLock.js:40:26)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at Blockchain.pushMessage (/root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js:291:9)
    at BlockchainContractProvider.external (/root/node_modules/ton-sandbox-server-dev/dist/blockchain/BlockchainContractProvider.js:94:9)
    at Object.send (/root/node_modules/ton-sandbox-server-dev/dist/treasury/Treasury.js:68:17)
    at BlockchainContractProvider.internal (/root/node_modules/ton-sandbox-server-dev/dist/blockchain/BlockchainContractProvider.js:112:9)
    at JettonWallet.sendTransfer (/root/wrappers/01_jetton/JettonWallet.ts:58:9)
    at Proxy.<anonymous> (/root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js:652:39)
    at Object.<anonymous> (/root/tests/01_jetton/JettonWallet.spec.ts:637:47) (at console.<anonymous> (file:///Applications/Visual%20Studio%20Code.app/Contents/Resources/app/out/vs/workbench/api/node/extensionHostProcess.js:201:30974))`

        const expected: CallStackEntry[] = [
            {
                function: "",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js",
                line: 294,
                column: 24,
            },
            {
                function: "AsyncLock.with",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/utils/AsyncLock.js",
                line: 40,
                column: 26,
            },
            {
                function: "processTicksAndRejections",
                file: "node:internal/process/task_queues",
                line: 105,
                column: 5,
            },
            {
                function: "Blockchain.pushMessage",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js",
                line: 291,
                column: 9,
            },
            {
                function: "BlockchainContractProvider.external",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/blockchain/BlockchainContractProvider.js",
                line: 94,
                column: 9,
            },
            {
                function: "Object.send",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/treasury/Treasury.js",
                line: 68,
                column: 17,
            },
            {
                function: "BlockchainContractProvider.internal",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/blockchain/BlockchainContractProvider.js",
                line: 112,
                column: 9,
            },
            {
                function: "JettonWallet.sendTransfer",
                file: "/root/wrappers/01_jetton/JettonWallet.ts",
                line: 58,
                column: 9,
            },
            {
                function: "Proxy.<anonymous>",
                file: "/root/node_modules/ton-sandbox-server-dev/dist/blockchain/Blockchain.js",
                line: 652,
                column: 39,
            },
            {
                function: "Object.<anonymous>",
                file: "/root/tests/01_jetton/JettonWallet.spec.ts",
                line: 637,
                column: 47,
            },
        ]

        const result = parseCallStack(callStack)
        expect(result).toEqual(expected)
    })

    it("should parse simple function calls", () => {
        const callStack = `Error:
    at foo (bar.js:10:5)
    at baz (qux.ts:20:15)`

        const expected: CallStackEntry[] = [
            {
                function: "foo",
                file: "bar.js",
                line: 10,
                column: 5,
            },
            {
                function: "baz",
                file: "qux.ts",
                line: 20,
                column: 15,
            },
        ]

        expect(parseCallStack(callStack)).toEqual(expected)
    })

    it("should parse calls without locations", () => {
        const callStack = `Error:
    at foo
    at bar (baz.js:5:10)
    at /some/path/file.js:42`

        const expected: CallStackEntry[] = [
            {
                function: "foo",
            },
            {
                function: "bar",
                file: "baz.js",
                line: 5,
                column: 10,
            },
            {
                function: "",
                file: "/some/path/file.js",
                line: 42,
            },
        ]

        expect(parseCallStack(callStack)).toEqual(expected)
    })

    it("should parse calls with only file and line", () => {
        const callStack = `Error:
    at test.js:42
    at another.ts:100`

        const expected: CallStackEntry[] = [
            {
                function: "",
                file: "test.js",
                line: 42,
            },
            {
                function: "",
                file: "another.ts",
                line: 100,
            },
        ]

        expect(parseCallStack(callStack)).toEqual(expected)
    })

    it('should ignore lines that do not start with "at "', () => {
        const callStack = `Error: Something went wrong
    This is not a stack trace line
    at foo (bar.js:1:2)
    Another non-stack line
    at baz (qux.ts:3:4)`

        const expected: CallStackEntry[] = [
            {
                function: "foo",
                file: "bar.js",
                line: 1,
                column: 2,
            },
            {
                function: "baz",
                file: "qux.ts",
                line: 3,
                column: 4,
            },
        ]

        expect(parseCallStack(callStack)).toEqual(expected)
    })
})
