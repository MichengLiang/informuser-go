package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/t103o/informuser-go/internal/mcpbridge"
)

const defaultDaemonURL = "http://127.0.0.1:8765"

type askUserInput struct {
	Abstract string `json:"abstract" jsonschema:"Short summary shown in the task list and browser title area."`
	Content  string `json:"content" jsonschema:"Markdown body shown in the browser workbench."`
}

func main() {
	if err := run(context.Background()); err != nil {
		slog.Error("popup MCP server stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	daemonURL := os.Getenv("ASKUSER_DAEMON_URL")
	if daemonURL == "" {
		daemonURL = defaultDaemonURL
	}

	waiter := mcpbridge.Waiter{
		Client: mcpbridge.NewDaemonClient(daemonURL, http.DefaultClient),
	}
	fallbackSessionID := "session-" + uuid.NewString()

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "popup",
		Version: "0.1.0",
	}, nil)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "AskUser",
		Title:       "Ask User",
		Description: "Send a Markdown question to the local AskUser Popup browser workbench and wait for the user's reply.",
	}, func(ctx context.Context, request *mcp.CallToolRequest, input askUserInput) (*mcp.CallToolResult, any, error) {
		taskID := uuid.NewString()
		registration := mcpbridge.TaskRegistration{
			TaskID:    taskID,
			SessionID: sessionIDForRequest(request, fallbackSessionID),
			Abstract:  input.Abstract,
			Content:   input.Content,
		}

		reply, err := waiter.WaitForReply(ctx, registration)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{
			Content: []mcp.Content{
				&mcp.TextContent{Text: reply},
			},
		}, nil, nil
	})

	return server.Run(ctx, &mcp.StdioTransport{})
}

func sessionIDForRequest(request *mcp.CallToolRequest, fallbackSessionID string) string {
	if request != nil && request.Session != nil {
		if sessionID := request.Session.ID(); sessionID != "" {
			return sessionID
		}
	}
	return fallbackSessionID
}
