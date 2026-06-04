package mcpbridge

import (
	"context"
	"encoding/json"
	"errors"
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

func TestNewDaemonClientTrimsBaseURLAndUsesDefaultHTTPClient(t *testing.T) {
	client := NewDaemonClient("http://127.0.0.1:8765///", nil)

	if client.baseURL != "http://127.0.0.1:8765" {
		t.Fatalf("baseURL = %q, want trimmed URL", client.baseURL)
	}
	if client.httpClient != http.DefaultClient {
		t.Fatalf("httpClient = %#v, want http.DefaultClient", client.httpClient)
	}
}

func TestRegisterTaskReturnsHTTPStatusError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad task", http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewDaemonClient(server.URL, server.Client())
	err := client.RegisterTask(context.Background(), TaskRegistration{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})

	var statusErr HTTPStatusError
	if !errors.As(err, &statusErr) {
		t.Fatalf("err = %v, want HTTPStatusError", err)
	}
	if statusErr.Operation != "register task" || statusErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("statusErr = %#v", statusErr)
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

func TestTaskResultReturnsHTTPAndDecodeErrors(t *testing.T) {
	tests := map[string]struct {
		status int
		body   string
	}{
		"http status": {status: http.StatusInternalServerError, body: "broken"},
		"bad json":    {status: http.StatusOK, body: "{"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()

			client := NewDaemonClient(server.URL, server.Client())
			_, err := client.TaskResult(context.Background(), "task-1")
			if err == nil {
				t.Fatal("TaskResult returned nil error")
			}
		})
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

func TestWaitForReplyKeepsPollingAfterResultErrors(t *testing.T) {
	resultCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/tasks":
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "created"})
		case r.Method == http.MethodGet && r.URL.Path == "/api/tasks/task-1/result":
			resultCalls++
			if resultCalls == 1 {
				http.Error(w, "temporarily unavailable", http.StatusServiceUnavailable)
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
	if reply != "reply" || resultCalls != 2 {
		t.Fatalf("reply=%q resultCalls=%d", reply, resultCalls)
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

func TestRetryableRegistrationStatusClasses(t *testing.T) {
	tests := map[int]bool{
		http.StatusRequestTimeout:      true,
		http.StatusTooManyRequests:     true,
		http.StatusInternalServerError: true,
		http.StatusBadRequest:          false,
		http.StatusUnauthorized:        false,
	}

	for status, want := range tests {
		err := HTTPStatusError{Operation: "register task", StatusCode: status}
		if got := isRetryableRegistrationError(err); got != want {
			t.Fatalf("status %d retryable = %v, want %v", status, got, want)
		}
	}
	if !isRetryableRegistrationError(errors.New("network")) {
		t.Fatal("non-HTTP registration error should be retryable")
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

func TestSleepContextReturnsAfterDurationAndCancellation(t *testing.T) {
	if err := sleepContext(context.Background(), time.Nanosecond); err != nil {
		t.Fatalf("sleep returned error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := sleepContext(ctx, time.Second); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled sleep err = %v, want context.Canceled", err)
	}
}
