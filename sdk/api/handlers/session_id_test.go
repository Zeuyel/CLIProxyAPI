package handlers

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/tidwall/gjson"
)

func TestExtractSessionID_CodexPriority(t *testing.T) {
	const (
		headerSessionID = "header-session-id-1234567890"
		headerAltID     = "header-alt-session-id-1234567890"
		promptCacheKey  = "prompt-cache-key-1234567890"
		metadataID      = "metadata-session-id-1234567890"
		prevResponseID  = "previous-response-id-1234567890"
	)

	rawJSON := []byte(`{
		"input": [],
		"prompt_cache_key": "` + promptCacheKey + `",
		"metadata": {"session_id": "` + metadataID + `"},
		"previous_response_id": "` + prevResponseID + `"
	}`)

	t.Run("session_id header first", func(t *testing.T) {
		headers := http.Header{}
		headers.Set(sessionHeaderKey, headerSessionID)
		headers.Set(sessionHeaderAltKey, headerAltID)
		if got := extractSessionID("openai-response", rawJSON, headers); got != headerSessionID {
			t.Fatalf("extractSessionID() = %q, want %q", got, headerSessionID)
		}
	})

	t.Run("x-session-id header fallback", func(t *testing.T) {
		headers := http.Header{}
		headers.Set(sessionHeaderAltKey, headerAltID)
		if got := extractSessionID("openai-response", rawJSON, headers); got != headerAltID {
			t.Fatalf("extractSessionID() = %q, want %q", got, headerAltID)
		}
	})

	t.Run("prompt_cache_key before metadata", func(t *testing.T) {
		headers := http.Header{}
		if got := extractSessionID("openai-response", rawJSON, headers); got != promptCacheKey {
			t.Fatalf("extractSessionID() = %q, want %q", got, promptCacheKey)
		}
	})

	t.Run("previous_response_id prefixed fallback", func(t *testing.T) {
		headers := http.Header{}
		payload := []byte(`{"input":[],"previous_response_id":"` + prevResponseID + `"}`)
		want := codexSessionPrefix + prevResponseID
		if got := extractSessionID("openai-response", payload, headers); got != want {
			t.Fatalf("extractSessionID() = %q, want %q", got, want)
		}
	})
}

func TestExtractSessionID_CodexRejectsShortHeader(t *testing.T) {
	headers := http.Header{}
	headers.Set(sessionHeaderKey, "too-short")
	rawJSON := []byte(`{"input":[],"prompt_cache_key":"prompt-cache-key-1234567890"}`)
	got := extractSessionID("openai-response", rawJSON, headers)
	if got != "prompt-cache-key-1234567890" {
		t.Fatalf("extractSessionID() = %q, want prompt_cache_key fallback", got)
	}
}

func TestCompleteCodexSessionIdentifiers_FillFromBody(t *testing.T) {
	headers := http.Header{}
	rawJSON := []byte(`{"input":[],"prompt_cache_key":"prompt-cache-key-1234567890"}`)

	completed := completeCodexSessionIdentifiers(rawJSON, headers)
	sessionID := headers.Get(sessionHeaderKey)
	if sessionID != "prompt-cache-key-1234567890" {
		t.Fatalf("session_id header = %q, want prompt_cache_key", sessionID)
	}
	if alt := headers.Get(sessionHeaderAltKey); alt != sessionID {
		t.Fatalf("x-session-id header = %q, want %q", alt, sessionID)
	}
	if got := gjson.GetBytes(completed, "prompt_cache_key").String(); got != sessionID {
		t.Fatalf("prompt_cache_key = %q, want %q", got, sessionID)
	}
}

func TestCompleteCodexSessionIdentifiers_GenerateWhenMissing(t *testing.T) {
	headers := http.Header{}
	rawJSON := []byte(`{"input":[]}`)

	completed := completeCodexSessionIdentifiers(rawJSON, headers)
	sessionID := headers.Get(sessionHeaderKey)
	if sanitizeCodexSessionID(sessionID) == "" {
		t.Fatalf("generated session_id %q is invalid", sessionID)
	}
	if alt := headers.Get(sessionHeaderAltKey); alt != sessionID {
		t.Fatalf("x-session-id header = %q, want %q", alt, sessionID)
	}
	if got := gjson.GetBytes(completed, "prompt_cache_key").String(); got != sessionID {
		t.Fatalf("prompt_cache_key = %q, want %q", got, sessionID)
	}
}

func TestCompleteCodexSessionIdentifiers_FillFromMetadataSessionID(t *testing.T) {
	headers := http.Header{}
	rawJSON := []byte(`{"input":[],"metadata":{"session_id":"metadata-session-id-1234567890"}}`)

	completed := completeCodexSessionIdentifiers(rawJSON, headers)
	sessionID := headers.Get(sessionHeaderKey)
	if sessionID != "metadata-session-id-1234567890" {
		t.Fatalf("session_id header = %q, want metadata.session_id", sessionID)
	}
	if got := gjson.GetBytes(completed, "prompt_cache_key").String(); got != sessionID {
		t.Fatalf("prompt_cache_key = %q, want %q", got, sessionID)
	}
}

func TestCompleteCodexSessionIdentifiers_NonCodexNoMutation(t *testing.T) {
	headers := http.Header{}
	rawJSON := []byte(`{"messages":[{"role":"user","content":"hello"}]}`)
	completed := completeCodexSessionIdentifiers(rawJSON, headers)
	if !bytes.Equal(completed, rawJSON) {
		t.Fatalf("non-codex payload was mutated: got %q want %q", string(completed), string(rawJSON))
	}
	if len(headers) != 0 {
		t.Fatalf("headers should stay untouched for non-codex payload")
	}
}
