package management

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/router-for-me/CLIProxyAPI/v6/internal/config"
)

// GetReverseProxies retrieves all reverse proxy configurations.
func (h *Handler) GetReverseProxies(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	proxies := h.cfg.ReverseProxies
	if proxies == nil {
		proxies = []config.ReverseProxy{}
	}

	c.JSON(http.StatusOK, gin.H{
		"reverse-proxies": proxies,
	})
}

// CreateReverseProxy creates a new reverse proxy configuration.
func (h *Handler) CreateReverseProxy(c *gin.Context) {
	var req config.ReverseProxy
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate required fields
	if req.Name == "" || req.BaseURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and base-url are required"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Generate unique ID
	req.ID = uuid.New().String()
	req.CreatedAt = time.Now().Format(time.RFC3339)

	// Default to enabled if not specified
	if !req.Enabled {
		req.Enabled = true
	}

	// Add to configuration
	h.cfg.ReverseProxies = append(h.cfg.ReverseProxies, req)

	// Save configuration
	if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "reverse proxy created",
		"proxy":   req,
	})
}

// UpdateReverseProxy updates an existing reverse proxy configuration.
func (h *Handler) UpdateReverseProxy(c *gin.Context) {
	proxyID := c.Param("id")
	var req config.ReverseProxy
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Find and update
	found := false
	for i, proxy := range h.cfg.ReverseProxies {
		if proxy.ID == proxyID {
			// Preserve original ID and creation time
			req.ID = proxy.ID
			req.CreatedAt = proxy.CreatedAt
			h.cfg.ReverseProxies[i] = req
			found = true
			break
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "proxy not found"})
		return
	}

	// Save configuration
	if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "reverse proxy updated",
		"proxy":   req,
	})
}

// DeleteReverseProxy deletes a reverse proxy configuration.
func (h *Handler) DeleteReverseProxy(c *gin.Context) {
	proxyID := c.Param("id")

	h.mu.Lock()
	defer h.mu.Unlock()

	// Find and delete
	found := false
	for i, proxy := range h.cfg.ReverseProxies {
		if proxy.ID == proxyID {
			h.cfg.ReverseProxies = append(h.cfg.ReverseProxies[:i], h.cfg.ReverseProxies[i+1:]...)
			found = true
			break
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "proxy not found"})
		return
	}

	// Cleanup auth-level routing entries pointing to the deleted proxy
	if len(h.cfg.ProxyRoutingAuth) > 0 {
		for key, value := range h.cfg.ProxyRoutingAuth {
			if value == proxyID {
				delete(h.cfg.ProxyRoutingAuth, key)
			}
		}
	}

	// Cleanup provider-level routing entries pointing to the deleted proxy
	if h.cfg.ProxyRouting.Codex == proxyID {
		h.cfg.ProxyRouting.Codex = ""
	}
	if h.cfg.ProxyRouting.Antigravity == proxyID {
		h.cfg.ProxyRouting.Antigravity = ""
	}
	if h.cfg.ProxyRouting.Claude == proxyID {
		h.cfg.ProxyRouting.Claude = ""
	}
	if h.cfg.ProxyRouting.Gemini == proxyID {
		h.cfg.ProxyRouting.Gemini = ""
	}
	if h.cfg.ProxyRouting.GeminiCLI == proxyID {
		h.cfg.ProxyRouting.GeminiCLI = ""
	}
	if h.cfg.ProxyRouting.Vertex == proxyID {
		h.cfg.ProxyRouting.Vertex = ""
	}
	if h.cfg.ProxyRouting.AIStudio == proxyID {
		h.cfg.ProxyRouting.AIStudio = ""
	}
	if h.cfg.ProxyRouting.Qwen == proxyID {
		h.cfg.ProxyRouting.Qwen = ""
	}
	if h.cfg.ProxyRouting.IFlow == proxyID {
		h.cfg.ProxyRouting.IFlow = ""
	}

	// Save configuration
	if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "reverse proxy deleted"})
}

// GetProxyRouting retrieves the proxy routing configuration.
func (h *Handler) GetProxyRouting(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"proxy-routing": h.cfg.ProxyRouting,
	})
}

// GetProxyRoutingAuth retrieves the auth-level proxy routing configuration.
func (h *Handler) GetProxyRoutingAuth(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()

	routing := h.cfg.ProxyRoutingAuth
	if routing == nil {
		routing = map[string]string{}
	}

	c.JSON(http.StatusOK, gin.H{
		"proxy-routing-auth": routing,
	})
}

// UpdateProxyRouting updates the proxy routing configuration.
func (h *Handler) UpdateProxyRouting(c *gin.Context) {
	var req config.ProxyRouting
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.cfg.ProxyRouting = req

	// Save configuration
	if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "proxy routing updated",
		"proxy-routing": req,
	})
}

// UpdateProxyRoutingAuth updates the auth-level proxy routing configuration.
func (h *Handler) UpdateProxyRoutingAuth(c *gin.Context) {
	var req map[string]string
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clean := make(map[string]string, len(req))
	for key, value := range req {
		trimKey := strings.TrimSpace(key)
		trimValue := strings.TrimSpace(value)
		if trimKey == "" || trimValue == "" {
			continue
		}
		clean[trimKey] = trimValue
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	h.cfg.ProxyRoutingAuth = clean

	// Save configuration
	if err := config.SaveConfigPreserveComments(h.configFilePath, h.cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save config: %v", err)})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":             "proxy routing auth updated",
		"proxy-routing-auth": clean,
	})
}
