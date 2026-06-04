package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/t103o/informuser-go/internal/app"
	"github.com/t103o/informuser-go/internal/domain"
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

func newTestServerWithRepository(t *testing.T) (http.Handler, *store.TaskRepository) {
	t.Helper()

	repository, err := store.Open(context.Background(), ":memory:")
	if err != nil {
		t.Fatalf("open repository: %v", err)
	}
	t.Cleanup(func() {
		_ = repository.Close()
	})

	service := app.NewService(repository, &fixedClock{now: time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)})
	return NewRouter(service, nil), repository
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
	if pendingBody.Tasks[0].SessionDisplayName == "" || pendingBody.Tasks[0].SessionAutoName == "" {
		t.Fatalf("pending session fields should be populated: %#v", pendingBody.Tasks[0])
	}

	history := doJSON(t, handler, http.MethodGet, "/api/history?limit=10&offset=0", nil)
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}
	historyBody := decodeBody[listTasksResponse](t, history)
	if len(historyBody.Tasks) != 1 || historyBody.Tasks[0].TaskID != "task-2" {
		t.Fatalf("history body = %#v", historyBody)
	}
	if historyBody.Tasks[0].SessionDisplayName == "" || historyBody.Tasks[0].SessionAutoName == "" {
		t.Fatalf("history session fields should be populated: %#v", historyBody.Tasks[0])
	}
}

func TestRenameSessionEndpoint(t *testing.T) {
	handler := newTestServer(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-2",
		SessionID: "session-2",
		Abstract:  "Need review",
		Content:   "body",
	})

	rename := doJSON(t, handler, http.MethodPatch, "/api/sessions/session-1", renameSessionRequest{
		DisplayName: "  Spring  ",
	})
	if rename.Code != http.StatusOK {
		t.Fatalf("rename status = %d, body = %s", rename.Code, rename.Body.String())
	}
	body := decodeBody[sessionDTO](t, rename)
	if body.SessionID != "session-1" || body.DisplayName != "Spring" || body.AutoName == "" {
		t.Fatalf("rename body = %#v", body)
	}

	duplicate := doJSON(t, handler, http.MethodPatch, "/api/sessions/session-2", renameSessionRequest{
		DisplayName: "Spring",
	})
	if duplicate.Code != http.StatusOK {
		t.Fatalf("duplicate rename status = %d, body = %s", duplicate.Code, duplicate.Body.String())
	}
	duplicateBody := decodeBody[sessionDTO](t, duplicate)
	if duplicateBody.DisplayName != "Spring" || duplicateBody.SessionID != "session-2" {
		t.Fatalf("duplicate rename body = %#v", duplicateBody)
	}
}

func TestRenameSessionEndpointRejectsInvalidRequests(t *testing.T) {
	handler := newTestServer(t)

	blank := doJSON(t, handler, http.MethodPatch, "/api/sessions/session-1", renameSessionRequest{
		DisplayName: " \n\t ",
	})
	if blank.Code != http.StatusBadRequest {
		t.Fatalf("blank rename status = %d, body = %s", blank.Code, blank.Body.String())
	}

	missing := doJSON(t, handler, http.MethodPatch, "/api/sessions/missing-session", renameSessionRequest{
		DisplayName: "Spring",
	})
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing rename status = %d, body = %s", missing.Code, missing.Body.String())
	}

	badJSONRequest := httptest.NewRequest(http.MethodPatch, "/api/sessions/session-1", bytes.NewBufferString("{"))
	badJSON := httptest.NewRecorder()
	handler.ServeHTTP(badJSON, badJSONRequest)
	if badJSON.Code != http.StatusBadRequest {
		t.Fatalf("bad json rename status = %d, body = %s", badJSON.Code, badJSON.Body.String())
	}
}

func TestRenameSessionEndpointReportsInternalErrorsAsServerErrors(t *testing.T) {
	handler, repository := newTestServerWithRepository(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "body",
	})
	if err := repository.Close(); err != nil {
		t.Fatalf("close repository: %v", err)
	}

	rename := doJSON(t, handler, http.MethodPatch, "/api/sessions/session-1", renameSessionRequest{
		DisplayName: "Spring",
	})
	if rename.Code != http.StatusInternalServerError {
		t.Fatalf("rename internal error status = %d, body = %s", rename.Code, rename.Body.String())
	}
}

func TestHistoryArchiveEndpoints(t *testing.T) {
	handler := newTestServer(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Done",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "reply",
		ReplySource: "reply_panel",
	})

	archive := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{
		TaskIDs: []string{"task-1"},
	})
	if archive.Code != http.StatusOK {
		t.Fatalf("archive status = %d, body = %s", archive.Code, archive.Body.String())
	}
	archiveBody := decodeBody[historyTasksResponse](t, archive)
	if archiveBody.Status != "ok" || archiveBody.Updated != 1 {
		t.Fatalf("archive body = %#v", archiveBody)
	}

	history := doJSON(t, handler, http.MethodGet, "/api/history?limit=10&offset=0", nil)
	historyBody := decodeBody[listTasksResponse](t, history)
	if len(historyBody.Tasks) != 0 {
		t.Fatalf("active history body = %#v, want no tasks", historyBody)
	}

	archived := doJSON(t, handler, http.MethodGet, "/api/history/archived?limit=10&offset=0", nil)
	if archived.Code != http.StatusOK {
		t.Fatalf("archived status = %d, body = %s", archived.Code, archived.Body.String())
	}
	archivedBody := decodeBody[listTasksResponse](t, archived)
	if len(archivedBody.Tasks) != 1 || archivedBody.Tasks[0].TaskID != "task-1" || archivedBody.Tasks[0].ArchivedAt == "" {
		t.Fatalf("archived body = %#v", archivedBody)
	}

	repeatArchive := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{
		TaskIDs: []string{"task-1"},
	})
	repeatArchiveBody := decodeBody[historyTasksResponse](t, repeatArchive)
	if repeatArchive.Code != http.StatusOK || repeatArchiveBody.Updated != 0 {
		t.Fatalf("repeat archive status = %d, body = %#v", repeatArchive.Code, repeatArchiveBody)
	}

	unarchive := doJSON(t, handler, http.MethodPost, "/api/history/unarchive", historyTasksRequest{
		TaskIDs: []string{"task-1"},
	})
	if unarchive.Code != http.StatusOK {
		t.Fatalf("unarchive status = %d, body = %s", unarchive.Code, unarchive.Body.String())
	}
	unarchiveBody := decodeBody[historyTasksResponse](t, unarchive)
	if unarchiveBody.Status != "ok" || unarchiveBody.Updated != 1 {
		t.Fatalf("unarchive body = %#v", unarchiveBody)
	}

	restored := doJSON(t, handler, http.MethodGet, "/api/history?limit=10&offset=0", nil)
	restoredBody := decodeBody[listTasksResponse](t, restored)
	if len(restoredBody.Tasks) != 1 || restoredBody.Tasks[0].TaskID != "task-1" || restoredBody.Tasks[0].ArchivedAt != "" {
		t.Fatalf("restored history body = %#v", restoredBody)
	}

	repeatUnarchive := doJSON(t, handler, http.MethodPost, "/api/history/unarchive", historyTasksRequest{
		TaskIDs: []string{"task-1"},
	})
	repeatUnarchiveBody := decodeBody[historyTasksResponse](t, repeatUnarchive)
	if repeatUnarchive.Code != http.StatusOK || repeatUnarchiveBody.Updated != 0 {
		t.Fatalf("repeat unarchive status = %d, body = %#v", repeatUnarchive.Code, repeatUnarchiveBody)
	}
}

func TestHistoryArchiveEndpointsRejectInvalidRequests(t *testing.T) {
	handler := newTestServer(t)

	empty := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{})
	if empty.Code != http.StatusBadRequest {
		t.Fatalf("empty archive status = %d, body = %s", empty.Code, empty.Body.String())
	}
	missing := doJSON(t, handler, http.MethodPost, "/api/history/unarchive", historyTasksRequest{
		TaskIDs: []string{"missing"},
	})
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing unarchive status = %d, body = %s", missing.Code, missing.Body.String())
	}

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "pending-task",
		SessionID: "session-1",
		Abstract:  "Pending",
		Content:   "body",
	})
	pending := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{
		TaskIDs: []string{"pending-task"},
	})
	if pending.Code != http.StatusBadRequest {
		t.Fatalf("pending archive status = %d, body = %s", pending.Code, pending.Body.String())
	}

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/pending-task/cancel", nil)
	cancelled := doJSON(t, handler, http.MethodPost, "/api/history/unarchive", historyTasksRequest{
		TaskIDs: []string{"pending-task"},
	})
	if cancelled.Code != http.StatusBadRequest {
		t.Fatalf("cancelled unarchive status = %d, body = %s", cancelled.Code, cancelled.Body.String())
	}

	badJSONRequest := httptest.NewRequest(http.MethodPost, "/api/history/archive", bytes.NewBufferString("{"))
	badJSON := httptest.NewRecorder()
	handler.ServeHTTP(badJSON, badJSONRequest)
	if badJSON.Code != http.StatusBadRequest {
		t.Fatalf("bad json archive status = %d, body = %s", badJSON.Code, badJSON.Body.String())
	}
}

func TestHistoryArchiveEndpointsRejectBlankTaskIDsAndReportInternalErrors(t *testing.T) {
	handler, repository := newTestServerWithRepository(t)

	blank := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{
		TaskIDs: []string{" \t "},
	})
	if blank.Code != http.StatusBadRequest {
		t.Fatalf("blank archive status = %d, body = %s", blank.Code, blank.Body.String())
	}

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Done",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "reply",
		ReplySource: "reply_panel",
	})
	if err := repository.Close(); err != nil {
		t.Fatalf("close repository: %v", err)
	}

	archive := doJSON(t, handler, http.MethodPost, "/api/history/archive", historyTasksRequest{
		TaskIDs: []string{"task-1"},
	})
	if archive.Code != http.StatusInternalServerError {
		t.Fatalf("archive internal error status = %d, body = %s", archive.Code, archive.Body.String())
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
	created, ok := publisher.events[0].(domain.TaskEvent)
	if !ok {
		t.Fatalf("first event = %#v, want domain.TaskEvent", publisher.events[0])
	}
	if created.Type != domain.EventTypeTaskCreated {
		t.Fatalf("first event type = %q, want task_created", created.Type)
	}
	if created.Task.SessionDisplayName == "" || created.Task.SessionAutoName == "" {
		t.Fatalf("created task event session fields should be populated: %#v", created.Task)
	}
}

func TestFindTaskEndpoint(t *testing.T) {
	handler := newTestServer(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})

	found := doJSON(t, handler, http.MethodGet, "/api/tasks/task-1", nil)
	if found.Code != http.StatusOK {
		t.Fatalf("find status = %d, body = %s", found.Code, found.Body.String())
	}
	body := decodeBody[taskDTO](t, found)
	if body.TaskID != "task-1" || body.Status != "pending" {
		t.Fatalf("find body = %#v", body)
	}
	if body.SessionDisplayName == "" || body.SessionAutoName == "" {
		t.Fatalf("find task session fields should be populated: %#v", body)
	}

	missing := doJSON(t, handler, http.MethodGet, "/api/tasks/missing", nil)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing status = %d, body = %s", missing.Code, missing.Body.String())
	}
}

func TestCancelTaskEndpointCancelsAndPublishesEvent(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := newTestServerWithPublisher(t, publisher)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})

	cancel := doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/cancel", nil)
	if cancel.Code != http.StatusOK {
		t.Fatalf("cancel status = %d, body = %s", cancel.Code, cancel.Body.String())
	}

	found := doJSON(t, handler, http.MethodGet, "/api/tasks/task-1", nil)
	body := decodeBody[taskDTO](t, found)
	if body.Status != "cancelled" || body.CancelReason != "cancelled_by_user" {
		t.Fatalf("cancelled body = %#v", body)
	}
	if len(publisher.events) != 2 {
		t.Fatalf("published events = %#v, want create and cancel events", publisher.events)
	}
}

func TestCancelTaskEndpointRejectsMissingAndCompletedTasks(t *testing.T) {
	handler := newTestServer(t)

	missing := doJSON(t, handler, http.MethodPost, "/api/tasks/missing/cancel", nil)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing cancel status = %d, body = %s", missing.Code, missing.Body.String())
	}

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "approved",
		ReplySource: "reply_panel",
	})

	completed := doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/cancel", nil)
	if completed.Code != http.StatusBadRequest {
		t.Fatalf("completed cancel status = %d, body = %s", completed.Code, completed.Body.String())
	}
}

func TestCreateTaskRejectsBadJSONAndInvalidPayload(t *testing.T) {
	handler := newTestServer(t)

	badJSONRequest := httptest.NewRequest(http.MethodPost, "/api/tasks", bytes.NewBufferString("{"))
	badJSON := httptest.NewRecorder()
	handler.ServeHTTP(badJSON, badJSONRequest)
	if badJSON.Code != http.StatusBadRequest {
		t.Fatalf("bad json status = %d, body = %s", badJSON.Code, badJSON.Body.String())
	}

	invalid := doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "",
		Content:   "# Review",
	})
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid status = %d, body = %s", invalid.Code, invalid.Body.String())
	}
}

func TestSubmitReplyRejectsMissingBadJSONAndInvalidPayload(t *testing.T) {
	handler := newTestServer(t)

	missing := doJSON(t, handler, http.MethodPost, "/api/tasks/missing/reply", submitReplyRequest{
		UserInput:   "approved",
		ReplySource: "reply_panel",
	})
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing reply status = %d, body = %s", missing.Code, missing.Body.String())
	}

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Need review",
		Content:   "# Review",
	})

	badJSONRequest := httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/reply", bytes.NewBufferString("{"))
	badJSON := httptest.NewRecorder()
	handler.ServeHTTP(badJSON, badJSONRequest)
	if badJSON.Code != http.StatusBadRequest {
		t.Fatalf("bad json status = %d, body = %s", badJSON.Code, badJSON.Body.String())
	}

	invalid := doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput: "",
	})
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid reply status = %d, body = %s", invalid.Code, invalid.Body.String())
	}
}

func TestHistoryEndpointUsesFallbackQueryValues(t *testing.T) {
	handler := newTestServer(t)

	_ = doJSON(t, handler, http.MethodPost, "/api/tasks", createTaskRequest{
		TaskID:    "task-1",
		SessionID: "session-1",
		Abstract:  "Done",
		Content:   "body",
	})
	_ = doJSON(t, handler, http.MethodPost, "/api/tasks/task-1/reply", submitReplyRequest{
		UserInput:   "reply",
		ReplySource: "reply_panel",
	})

	history := doJSON(t, handler, http.MethodGet, "/api/history?limit=bad&offset=bad", nil)
	if history.Code != http.StatusOK {
		t.Fatalf("history status = %d, body = %s", history.Code, history.Body.String())
	}
	body := decodeBody[listTasksResponse](t, history)
	if len(body.Tasks) != 1 || body.Tasks[0].TaskID != "task-1" {
		t.Fatalf("history body = %#v", body)
	}
}

func TestRouterMountsOptionalHandlers(t *testing.T) {
	service := app.NewService(newTestRepositoryForHTTP(t), &fixedClock{now: time.Date(2026, 6, 5, 1, 0, 0, 0, time.UTC)})
	router := NewRouter(
		service,
		nil,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "events")
		}),
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "static")
		}),
	)

	events := doJSON(t, router, http.MethodGet, "/api/events/ws", nil)
	if events.Body.String() != "events" {
		t.Fatalf("events body = %q", events.Body.String())
	}

	static := doJSON(t, router, http.MethodGet, "/app", nil)
	if static.Body.String() != "static" {
		t.Fatalf("static body = %q", static.Body.String())
	}
}

func newTestRepositoryForHTTP(t *testing.T) *store.TaskRepository {
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
	return repository
}
