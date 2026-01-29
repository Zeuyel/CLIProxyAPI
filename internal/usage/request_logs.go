package usage

import (
	"sort"
	"strings"
	"sync"
	"time"
)

const maxRequestLogEntries = 500

// RequestLogEntry represents a live request entry for monitor logging.
type RequestLogEntry struct {
	ID           string    `json:"id"`
	Method       string    `json:"method"`
	Path         string    `json:"path"`
	APIKey       string    `json:"api_key,omitempty"`
	RequestType  string    `json:"request_type,omitempty"`
	Model        string    `json:"model,omitempty"`
	SessionID    string    `json:"session_id,omitempty"`
	StatusCode   int       `json:"status_code"`
	ErrorMessage string    `json:"error_message,omitempty"`
	StartedAt    time.Time `json:"started_at"`
	CompletedAt  time.Time `json:"completed_at,omitempty"`
	DurationMs   int64     `json:"duration_ms"`
	Pending      bool      `json:"pending"`
}

// RequestLogUpdate carries optional fields to update a request entry.
type RequestLogUpdate struct {
	APIKey      string
	RequestType string
	Model       string
	SessionID   string
}

type requestLogStore struct {
	mu      sync.Mutex
	order   []string
	entries map[string]*RequestLogEntry
}

var defaultRequestLogStore = newRequestLogStore()

func newRequestLogStore() *requestLogStore {
	return &requestLogStore{
		order:   make([]string, 0, maxRequestLogEntries),
		entries: make(map[string]*RequestLogEntry),
	}
}

// StartRequestLog inserts a pending entry for a new request.
func StartRequestLog(id, method, path string, startedAt time.Time) {
	if id == "" {
		return
	}
	if startedAt.IsZero() {
		startedAt = time.Now()
	}
	entry := &RequestLogEntry{
		ID:        id,
		Method:    strings.ToUpper(strings.TrimSpace(method)),
		Path:      strings.TrimSpace(path),
		StartedAt: startedAt,
		Pending:   true,
	}
	defaultRequestLogStore.upsert(id, entry)
}

// UpdateRequestLog updates optional fields on a request entry.
func UpdateRequestLog(id string, update RequestLogUpdate) {
	if id == "" {
		return
	}
	defaultRequestLogStore.update(id, update)
}

// FinishRequestLog marks a request as completed and fills status/error details.
func FinishRequestLog(id string, status int, errorMessage string, completedAt time.Time) {
	if id == "" {
		return
	}
	if completedAt.IsZero() {
		completedAt = time.Now()
	}
	defaultRequestLogStore.finish(id, status, strings.TrimSpace(errorMessage), completedAt)
}

// SnapshotRequestLogs returns recent entries sorted by start time (desc).
func SnapshotRequestLogs(limit int) []RequestLogEntry {
	return defaultRequestLogStore.snapshot(limit)
}

func (s *requestLogStore) upsert(id string, entry *RequestLogEntry) {
	if s == nil || entry == nil || id == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing, ok := s.entries[id]; ok && existing != nil {
		existing.Method = entry.Method
		existing.Path = entry.Path
		existing.StartedAt = entry.StartedAt
		existing.Pending = entry.Pending
		return
	}

	s.entries[id] = entry
	s.order = append(s.order, id)
	if len(s.order) > maxRequestLogEntries {
		excess := len(s.order) - maxRequestLogEntries
		for i := 0; i < excess; i++ {
			if oldID := s.order[i]; oldID != "" {
				delete(s.entries, oldID)
			}
		}
		s.order = append([]string{}, s.order[excess:]...)
	}
}

func (s *requestLogStore) update(id string, update RequestLogUpdate) {
	if s == nil || id == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.entries[id]
	if entry == nil {
		return
	}
	if update.APIKey != "" {
		entry.APIKey = update.APIKey
	}
	if update.RequestType != "" {
		entry.RequestType = update.RequestType
	}
	if update.Model != "" {
		entry.Model = update.Model
	}
	if update.SessionID != "" {
		entry.SessionID = update.SessionID
	}
}

func (s *requestLogStore) finish(id string, status int, errorMessage string, completedAt time.Time) {
	if s == nil || id == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := s.entries[id]
	if entry == nil {
		return
	}
	if status > 0 {
		entry.StatusCode = status
	}
	if errorMessage != "" {
		entry.ErrorMessage = errorMessage
	}
	entry.CompletedAt = completedAt
	if !entry.StartedAt.IsZero() {
		entry.DurationMs = completedAt.Sub(entry.StartedAt).Milliseconds()
	}
	entry.Pending = false
}

func (s *requestLogStore) snapshot(limit int) []RequestLogEntry {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if limit <= 0 || limit > len(s.order) {
		limit = len(s.order)
	}

	entries := make([]RequestLogEntry, 0, limit)
	for i := len(s.order) - 1; i >= 0 && len(entries) < limit; i-- {
		id := s.order[i]
		entry := s.entries[id]
		if entry == nil {
			continue
		}
		entries = append(entries, *entry)
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].StartedAt.After(entries[j].StartedAt)
	})
	return entries
}
