import {normalizeRetraceHash, parseActonContractIds} from "./ActonRetraceUtils"

describe("Acton retrace utils", () => {
    it("parses contract ids from Acton.toml content", () => {
        const content = `
[contracts.Counter]
path = "contracts/counter.tolk"

[contracts.JettonMinter]
path = "contracts/jetton-minter.tolk"

[contracts.JettonMinter.test]
skip = true
`

        expect(parseActonContractIds(content)).toEqual(["Counter", "JettonMinter"])
    })

    it("normalizes retrace hashes and strips the 0x prefix", () => {
        const hash = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

        expect(normalizeRetraceHash(hash)).toBe(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        )
    })

    it("rejects invalid retrace hashes", () => {
        expect(normalizeRetraceHash("")).toBeNull()
        expect(normalizeRetraceHash("0x1234")).toBeNull()
        expect(normalizeRetraceHash("zzzz")).toBeNull()
    })
})
