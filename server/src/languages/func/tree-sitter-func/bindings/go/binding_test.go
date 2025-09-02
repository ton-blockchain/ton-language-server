package tree_sitter_func_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_func "github.com/tree-sitter/tree-sitter-func/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_func.Language())
	if language == nil {
		t.Errorf("Error loading FunC grammar")
	}
}
