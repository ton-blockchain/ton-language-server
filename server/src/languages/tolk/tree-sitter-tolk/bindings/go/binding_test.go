package tree_sitter_tolk_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-tolk"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_tolk.Language())
	if language == nil {
		t.Errorf("Error loading Tolk grammar")
	}
}
