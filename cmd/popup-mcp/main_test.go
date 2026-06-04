package main

import "testing"

func TestSessionIDForRequestUsesStableFallback(t *testing.T) {
	const fallbackSessionID = "session-process-stable"

	got := sessionIDForRequest(nil, fallbackSessionID)

	if got != fallbackSessionID {
		t.Fatalf("sessionIDForRequest(nil) = %q, want %q", got, fallbackSessionID)
	}
}
