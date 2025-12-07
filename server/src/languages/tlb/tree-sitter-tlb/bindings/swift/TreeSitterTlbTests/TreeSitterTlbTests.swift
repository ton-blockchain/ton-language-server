import XCTest
import SwiftTreeSitter
import TreeSitterTlb

final class TreeSitterTlbTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_tlb())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading TL-B grammar")
    }
}
