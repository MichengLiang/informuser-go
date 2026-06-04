package mcpbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type TaskRegistration struct {
	TaskID    string
	SessionID string
	Abstract  string
	Content   string
}

type TaskReply struct {
	Found     bool
	UserInput string
}

type DaemonClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewDaemonClient(baseURL string, httpClient *http.Client) *DaemonClient {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &DaemonClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: httpClient,
	}
}

type createTaskPayload struct {
	TaskID    string `json:"task_id"`
	SessionID string `json:"session_id"`
	Abstract  string `json:"abstract"`
	Content   string `json:"content"`
}

type taskResultPayload struct {
	Status    string `json:"status"`
	UserInput string `json:"user_input"`
}

func (c *DaemonClient) RegisterTask(ctx context.Context, registration TaskRegistration) error {
	payload := createTaskPayload{
		TaskID:    registration.TaskID,
		SessionID: registration.SessionID,
		Abstract:  registration.Abstract,
		Content:   registration.Content,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/tasks", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("register task failed: status %d", response.StatusCode)
	}
	return nil
}

func (c *DaemonClient) TaskResult(ctx context.Context, taskID string) (TaskReply, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		c.baseURL+"/api/tasks/"+taskID+"/result",
		nil,
	)
	if err != nil {
		return TaskReply{}, err
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return TaskReply{}, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return TaskReply{}, fmt.Errorf("poll task result failed: status %d", response.StatusCode)
	}

	var payload taskResultPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return TaskReply{}, err
	}
	if payload.Status != "found" {
		return TaskReply{Found: false}, nil
	}
	return TaskReply{Found: true, UserInput: payload.UserInput}, nil
}
