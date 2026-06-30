import {readFileSync} from "node:fs"
import * as path from "node:path"

interface GrammarPattern {
    readonly name?: string
    readonly match?: string
    readonly captures?: Record<string, GrammarPattern>
    readonly begin?: string
    readonly beginCaptures?: Record<string, GrammarPattern>
    readonly end?: string
    readonly patterns?: readonly GrammarPattern[]
}

interface TolkGrammar {
    readonly patterns: readonly GrammarPattern[]
}

describe("Tolk TextMate grammar", () => {
    it("scopes integer literals with compiler-compatible separators", () => {
        const grammar = readTolkGrammar()
        const numericPattern = grammar.patterns.find(pattern => pattern.name === "constant.numeric")
        const numericRegex = new RegExp(numericPattern?.match ?? "", "u")

        expect(numericRegex.exec("100_000")?.[0]).toBe("100_000")
        expect(numericRegex.exec("0xFF_FF")?.[0]).toBe("0xFF_FF")
        expect(numericRegex.exec("0b1010_0011")?.[0]).toBe("0b1010_0011")
        expect(numericRegex.exec("123_")?.[0]).toBe("123_")
        expect(numericRegex.exec("0b0_____1")?.[0]).toBe("0b0_____1")
        expect(numericRegex.exec("0b_0____1")?.[0]).toBe("0b_0____1")
        expect(numericRegex.exec("0x")?.[0]).toBe("0x")
        expect(numericRegex.exec("0b")?.[0]).toBe("0b")
        expect(numericRegex.exec("0x_FF")?.[0]).toBe("0x_FF")
        expect(numericRegex.exec("0b_")?.[0]).toBe("0b_")

        expect(numericRegex.exec("_100")).toBeNull()
    })

    it("scopes only ordinary string escapes accepted by the compiler", () => {
        const grammar = readTolkGrammar()
        const stringPattern = grammar.patterns.find(
            pattern => pattern.name === "string.quoted.double.tolk",
        )
        const escapePattern = stringPattern?.patterns?.find(
            pattern => pattern.name === "constant.character.escape.tolk",
        )
        const escapeRegex = new RegExp(escapePattern?.match ?? "", "u")

        for (const validEscape of ["\\n", "\\r", "\\t", "\\\\", "\\'", '\\"']) {
            expect(escapeRegex.exec(validEscape)?.[0]).toBe(validEscape)
        }

        expect(escapeRegex.exec("\\0")).toBeNull()
        expect(escapeRegex.exec("\\u")).toBeNull()
        expect(escapeRegex.exec("\\u1234")).toBeNull()
    })

    it("keeps triple-quoted string escapes broad for asm strings", () => {
        const grammar = readTolkGrammar()
        const stringPattern = grammar.patterns.find(
            pattern => pattern.name === "string.quoted.triple.tolk",
        )
        const escapePattern = stringPattern?.patterns?.find(
            pattern => pattern.name === "constant.character.escape.tolk",
        )
        const escapeRegex = new RegExp(escapePattern?.match ?? "", "u")

        for (const escape of ["\\n", "\\0", "\\u", "\\u1234", "\\x"]) {
            expect(escapeRegex.exec(escape)?.[0]).toBe(escape.slice(0, 2))
        }
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
