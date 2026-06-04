package domain

import "testing"

func TestAutomaticSessionNameIsStableAndReadable(t *testing.T) {
	first := AutomaticSessionName("session-1")
	second := AutomaticSessionName("session-1")

	if first == "" {
		t.Fatal("automatic session name should not be empty")
	}
	if first != second {
		t.Fatalf("automatic session name = %q then %q, want stable value", first, second)
	}
	if len(first) != len("S-XXXXX") || first[:2] != "S-" {
		t.Fatalf("automatic session name = %q, want S-XXXXX form", first)
	}
}
