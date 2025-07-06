import XCTest
import SwiftTreeSitter
import TreeSitterFift

final class TreeSitterFiftTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_fift())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Fift grammar")
    }
}
