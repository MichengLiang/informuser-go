package mcpbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRegisterTaskPostsAskUserPayload(t *testing.T) {
	var received createTaskPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/tasks" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
	}))
	defer server.Close()

	client := NewDaemonClient(server.URL, server.Client())
	err := client.RegisterTask(context.Background(), TaskRegistration{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if err != nil {
		t.Fatalf("register task: %v", err)
	}

	if received.TaskID != "task-1" || received.Abstract != "Need review" {
		t.Fatalf("received payload = %#v", received)
	}
}

func TestTaskResultNotFoundAndFound(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/api/tasks/task-1/result" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		calls++
		if calls == 1 {
			_ = json.NewEncoder(w).Encode(taskResultPayload{Status: "not_found"})
			return
		}
		_ = json.NewEncoder(w).Encode(taskResultPayload{Status: "found", UserInput: "reply"})
	}))
	defer server.Close()

	client := NewDaemonClient(server.URL, server.Client())
	first, err := client.TaskResult(context.Background(), "task-1")
	if err != nil {
		t.Fatalf("first result: %v", err)
	}
	if first.Found {
		t.Fatal("first result should not be found")
	}

	second, err := client.TaskResult(context.Background(), "task-1")
	if err != nil {
		t.Fatalf("second result: %v", err)
	}
	if !second.Found || second.UserInput != "reply" {
		t.Fatalf("second result = %#v", second)
	}
}

func TestWaitForReplyRetriesRegistrationAndPollsUntilFound(t *testing.T) {
	registerCalls := 0
	resultCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/tasks":
			registerCalls++
			if registerCalls == 1 {
				http.Error(w, "temporarily unavailable", http.StatusServiceUnavailable)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
		case r.Method == http.MethodGet && r.URL.Path == "/api/tasks/task-1/result":
			resultCalls++
			if resultCalls == 1 {
				_ = json.NewEncoder(w).Encode(taskResultPayload{Status: "not_found"})
				return
			}
			_ = json.NewEncoder(w).Encode(taskResultPayload{Status: "found", UserInput: "reply"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewDaemonClient(server.URL, server.Client())
	waiter := Waiter{
		Client:        client,
		RegisterDelay: time.Nanosecond,
		PollInterval:  time.Nanosecond,
		Sleep: func(ctx context.Context, d time.Duration) error {
			return nil
		},
	}

	reply, err := waiter.WaitForReply(context.Background(), TaskRegistration{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if err != nil {
		t.Fatalf("wait for reply: %v", err)
	}
	if reply != "reply" {
		t.Fatalf("reply = %q, want reply", reply)
	}
	if registerCalls != 2 || resultCalls != 2 {
		t.Fatalf("registerCalls=%d resultCalls=%d", registerCalls, resultCalls)
	}
}

func TestWaitForReplyDoesNotRetryPermanentRegistrationError(t *testing.T) {
	registerCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/tasks" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		registerCalls++
		http.Error(w, "bad task", http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewDaemonClient(server.URL, server.Client())
	slept := false
	waiter := Waiter{
		Client:        client,
		RegisterDelay: time.Nanosecond,
		PollInterval:  time.Nanosecond,
		Sleep: func(ctx context.Context, d time.Duration) error {
			slept = true
			return context.Canceled
		},
	}

	_, err := waiter.WaitForReply(context.Background(), TaskRegistration{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if err == nil {
		t.Fatal("permanent registration error returned nil")
	}
	if !strings.Contains(err.Error(), "status 400") {
		t.Fatalf("error = %v, want status 400", err)
	}
	if registerCalls != 1 {
		t.Fatalf("registerCalls = %d, want 1", registerCalls)
	}
	if slept {
		t.Fatal("waiter slept after permanent registration error")
	}
}

func TestWaitForReplyStopsWhenContextIsCancelled(t *testing.T) {
	client := NewDaemonClient("http://127.0.0.1:1", http.DefaultClient)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	waiter := Waiter{
		Client:        client,
		RegisterDelay: time.Nanosecond,
		PollInterval:  time.Nanosecond,
		Sleep: func(ctx context.Context, d time.Duration) error {
			return ctx.Err()
		},
	}

	_, err := waiter.WaitForReply(ctx, TaskRegistration{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if err == nil {
		t.Fatal("cancelled context returned nil error")
	}
}
