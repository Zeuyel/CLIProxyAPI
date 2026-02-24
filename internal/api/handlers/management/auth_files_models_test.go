package management

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/registry"
	coreauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
)

type authModelsResponse struct {
	Models []struct {
		ID string `json:"id"`
	} `json:"models"`
}

func TestGetAuthFileModels_PrefersExplicitIDQuery(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	store := &memoryAuthStore{}
	manager := coreauth.NewManager(store, nil, nil)

	_, _ = manager.Register(context.Background(), &coreauth.Auth{
		ID:       "stale-id",
		FileName: "foo.json",
		Provider: "codex",
	})
	_, _ = manager.Register(context.Background(), &coreauth.Auth{
		ID:       "active-id",
		FileName: "other.json",
		Provider: "codex",
	})

	reg := registry.GetGlobalRegistry()
	reg.RegisterClient("active-id", "codex", []*registry.ModelInfo{
		{ID: "gpt-5"},
	})
	defer reg.UnregisterClient("active-id")
	defer reg.UnregisterClient("stale-id")

	h := &Handler{authManager: manager}
	r := gin.New()
	r.GET("/models", h.GetAuthFileModels)

	req := httptest.NewRequest(http.MethodGet, "/models?name=foo.json&id=active-id", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var payload authModelsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Models) != 1 || payload.Models[0].ID != "gpt-5" {
		t.Fatalf("unexpected models response: %+v", payload.Models)
	}
}

func TestGetAuthFileModels_MatchesNameByAuthIDBaseName(t *testing.T) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	store := &memoryAuthStore{}
	manager := coreauth.NewManager(store, nil, nil)

	authID := `C:\Users\demo\.cli-proxy-api\codex-demo.json`
	_, _ = manager.Register(context.Background(), &coreauth.Auth{
		ID:       authID,
		FileName: "",
		Provider: "codex",
	})

	reg := registry.GetGlobalRegistry()
	reg.RegisterClient(authID, "codex", []*registry.ModelInfo{
		{ID: "gpt-5-mini"},
	})
	defer reg.UnregisterClient(authID)

	h := &Handler{authManager: manager}
	r := gin.New()
	r.GET("/models", h.GetAuthFileModels)

	req := httptest.NewRequest(http.MethodGet, "/models?name=codex-demo.json", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var payload authModelsResponse
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(payload.Models) != 1 || payload.Models[0].ID != "gpt-5-mini" {
		t.Fatalf("unexpected models response: %+v", payload.Models)
	}
}

