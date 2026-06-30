import {readFileSync} from "node:fs"
import * as path from "node:path"

interface GrammarPattern {
    readonly name?: string
    readonly match?: string
    readonly begin?: string
    readonly beginCaptures?: Record<string, GrammarPattern>
    readonly end?: string
    readonly patterns?: readonly GrammarPattern[]
}

interface TolkGrammar {
    readonly patterns: readonly GrammarPattern[]
}

describe("Tolk TextMate grammar", () => {
    it("scopes integer literals with separators", () => {
        const grammar = readTolkGrammar()
        const numericPattern = grammar.patterns.find(pattern => pattern.name === "constant.numeric")
        const numericRegex = new RegExp(numericPattern?.match ?? "", "u")

        expect(numericRegex.exec("100_000")?.[0]).toBe("100_000")
        expect(numericRegex.exec("0xFF_FF")?.[0]).toBe("0xFF_FF")
        expect(numericRegex.exec("0b1010_0011")?.[0]).toBe("0b1010_0011")

        expect(numericRegex.exec("100_")).toBeNull()
        expect(numericRegex.exec("0x_FF")).toBeNull()
        expect(numericRegex.exec("0b_1010")).toBeNull()
    })

    it("scopes dotted annotation names without scoping dots", () => {
        const grammar = readTolkGrammar()
        const annotationPattern = grammar.patterns.find(pattern => pattern.begin?.startsWith("(@)"))
        const segmentPattern = annotationPattern?.patterns?.[0]

        expect(annotationPattern?.begin).toBe("(@)(?=[A-Za-z0-9_])")
        expect(annotationPattern?.beginCaptures?.["1"]?.name).toBe("entity.name.function.decorator")
        expect(annotationPattern?.end).toBe("(?![A-Za-z0-9_.])")
        expect(segmentPattern?.name).toBe("entity.name.function.decorator")
        expect(segmentPattern?.match).toBe("[A-Za-z0-9_]+")

        const segmentRegex = new RegExp(segmentPattern?.match ?? "", "u")
        expect(segmentRegex.exec("abi")?.[0]).toBe("abi")
        expect(segmentRegex.exec("clientType")?.[0]).toBe("clientType")
        expect(segmentRegex.exec(".")).toBeNull()
    })
})

function readTolkGrammar(): TolkGrammar {
    const grammarPath = path.join(process.cwd(), "syntaxes/tolk.tmLanguage.json")
    return JSON.parse(readFileSync(grammarPath, "utf8")) as TolkGrammar
}
