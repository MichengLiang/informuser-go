package domain

import (
	"encoding/base32"
	"hash/fnv"
	"strings"
	"time"
)

type Session struct {
	SessionID   string
	DisplayName string
	AutoName    string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	LastSeenAt  time.Time
}

func AutomaticSessionName(sessionID string) string {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(sessionID))
	sum := hash.Sum(nil)
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(sum)
	return "S-" + strings.ToUpper(encoded[:5])
}
