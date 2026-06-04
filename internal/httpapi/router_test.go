package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/t103o/informuser-go/internal/app"
	"github.com/t103o/informuser-go/internal/store"
)

type recordingPublisher struct {
	events []any
}

func (p *recordingPublisher) Publish(v any) {
	p.events = append(p.events, v)
}

type fixedClock struct {
	now time.Time
}

func (c *fixedClock) Now() time.Time {
	c.now = c.now.Add(time.Minute)
	return c.now
}

func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	return newTestServerWithPublisher(t, nil)
}

func newTestServerWithPublisher(t *testing.T, publisher EventPublisher) http.Handler {
	t.Helper()

	repository, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	t.Cleanup(func() {
		if err := repository.Close(); err != nil {
			t.Fatalf("close repository: %v", err)
		}
	})

	service := app.NewService(repository, &fixedClock{now: time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)})
	return NewRouter(service, publisher)
}

func doJSON(t *testing.T, handler http.Handler, method string, path string, body any) *httptest.ResponseRecorder {
	t.Helper()

	var payload bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&payload).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}

	request := httptest.NewRequest(method, path, &payload)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func decodeBody[T any](t *testing.T, recorder *httptest.ResponseRecorder) T {
	t.Helper()
	var value T
	if err := json.NewDecoder(recorder.Body).Decode(&value); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return value
}

func TestCreateTaskAndPollResult(t *testing.T) {
	handler := newTestServer(t)

	create := doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if create.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
	createBody := decodeBody[createTaskResponse](t, create)
	if createBody.Status != string(app.CreateTaskCreated) {
		t.Fatalf("create body = %#v", createBody)
	}

	notFound := doJSON(t, handler, http.MethodGet, "/api/tasks/task-1/result", nil)
	if notFound.Code != http.StatusOK {
		t.Fatalf("poll status = %d, body = %s", notFound.Code, notFound.Body.String())
	}
	notFoundBody := decodeBody[taskResultResponse](t, notFound)
	if notFoundBody.Status != "not_found" {
		t.Fatalf("poll body = %#v", notFoundBody)
	}

	reply := doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "approved",
		ReplySource: "quick_paste",
	})
	if reply.Code != http.StatusOK {
		t.Fatalf("reply status = %d, body = %s", reply.Code, reply.Body.String())
	}

	found := doJSON(t, handler, http.MethodGet, "/api/tasks/task-1/result", nil)
	foundBody := decodeBody[taskResultResponse](t, found)
	if foundBody.Status != "found" || foundBody.UserInput != "approved" {
		t.Fatalf("found body = %#v", foundBody)
	}
}

func TestCreateTaskAcceptsTitleMarkdownAliases(t *testing.T) {
	handler := newTestServer(t)

	create := doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Title:     "Need review",
		Markdown:  "# Review",
	})
	if create.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}
}

func TestPendingAndHistoryEndpoints(t *testing.T) {
	handler := newTestServer(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Pending",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-2",
		SessionID: "session-2",
		Abstract:  "Done",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/task-2/reply", submitReplyRequest{
		UserInput:   "reply",
		ReplySource: "reply_panel",
	})

	pending := doJSON(t, handler, http.MethodGet, "/api/tasks/pending", nil)
	if pending.Code != http.StatusOK {
		t.Fatalf("pending status = %d, body = %s", pending.Code, pending.Body.String())
	}
	pendingBody := decodeBody[listTasksResponse](t, pending)
	if len(pendingBody.Tasks) != 1 || pendingBody.Tasks[0].TaskID != "task-1" {
		t.Fatalf("pending body = %#v", pendingBody)
	}

	history := doJSON(t, handler, http.MethodGet, "/api/history?limit=10&offset=0", nil)
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}
	historyBody := decodeBody[listTasksResponse](t, history)
	if len(historyBody.Tasks) != 1 || historyBody.Tasks[0].TaskID != "task-2" {
		t.Fatalf("history body = %#v", historyBody)
	}
}

func TestHealthEndpoint(t *testing.T) {
	handler := newTestServer(t)

	response := doJSON(t, handler, http.MethodGet, "/api/health", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("health status = %d", response.Code)
	}

	body := decodeBody[map[string]string](t, response)
	if body["status"] != "ok" {
		t.Fatalf("health body = %#v", body)
	}
}

func TestCreateAndReplyPublishEvents(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := newTestServerWithPublisher(t, publisher)

	create := doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	if create.Code != http.StatusOK {
		t.Fatalf("create status = %d, body = %s", create.Code, create.Body.String())
	}

	reply := doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "approved",
		ReplySource: "quick_paste",
	})
	if reply.Code != http.StatusOK {
		t.Fatalf("reply status = %d, body = %s", reply.Code, reply.Body.String())
	}

	if len(publisher.events) != 2 {
		t.Fatalf("published events = %#v, want 2 events", publisher.events)
	}
}
