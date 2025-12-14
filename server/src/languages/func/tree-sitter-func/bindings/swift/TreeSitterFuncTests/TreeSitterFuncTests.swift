import XCTest
import SwiftTreeSitter
import TreeSitterFunc

final class TreeSitterFuncTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_func())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading FunC grammar")
    }
}
