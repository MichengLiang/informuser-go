package mcpbridge

import (
	"context"
	"time"
)

const (
	DefaultRegisterDelay = 2 * time.Second
	DefaultPollInterval  = 2 * time.Second
)

type SleepFunc func(context.Context, time.Duration) error

type Waiter struct {
	Client        *DaemonClient
	RegisterDelay time.Duration
	PollInterval  time.Duration
	Sleep         SleepFunc
}

func (w Waiter) WaitForReply(ctx context.Context, registration TaskRegistration) (string, error) {
	registerDelay := w.RegisterDelay
	if registerDelay <= 0 {
		registerDelay = DefaultRegisterDelay
	}
	pollInterval := w.PollInterval
	if pollInterval <= 0 {
		pollInterval = DefaultPollInterval
	}
	sleep := w.Sleep
	if sleep == nil {
		sleep = sleepContext
	}

	for {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		err := w.Client.RegisterTask(ctx, registration)
		if err == nil {
			break
		}
		// The popup daemon is a local companion process. Retrying preserves the
		// human checkpoint when the MCP server starts before the browser daemon.
		if err := sleep(ctx, registerDelay); err != nil {
			return "", err
		}
	}

	for {
		// AskUser intentionally has no application-level timeout. It represents a
		// human-in-the-loop pause and should block until the user replies or the
		// MCP client cancels the request.
		if err := sleep(ctx, pollInterval); err != nil {
			return "", err
		}
		result, err := w.Client.TaskResult(ctx, registration.TaskID)
		if err != nil {
			continue
		}
		if result.Found {
			return result.UserInput, nil
		}
	}
}

func sleepContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
