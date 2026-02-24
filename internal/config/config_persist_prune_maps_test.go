package config

import (
	"os"
	"path/filepath"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestSaveConfigPreserveComments_PrunesRemovedMapKeys(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	configFile := filepath.Join(dir, "config.yaml")
	initial := `api-keys:
  - key-all
  - key-restricted
api-key-auth:
  key-all:
    - auth-a
  key-restricted:
    - auth-b
api-key-expiry:
  key-all: "2099-01-01T00:00:00Z"
  key-restricted: "2099-01-02T00:00:00Z"
proxy-routing-auth:
  keep.json: proxy-1
  removed.json: proxy-2
`
	if err := os.WriteFile(configFile, []byte(initial), 0o644); err != nil {
		t.Fatalf("write initial config: %v", err)
	}

	cfg := &Config{}
	cfg.APIKeys = []string{"key-all", "key-restricted"}
	cfg.APIKeyAuth = map[string][]string{
		"key-all": {"auth-a"},
	}
	cfg.APIKeyExpiry = map[string]string{
		"key-all": "2099-01-01T00:00:00Z",
	}
	cfg.ProxyRoutingAuth = map[string]string{
		"keep.json": "proxy-1",
	}

	if err := SaveConfigPreserveComments(configFile, cfg); err != nil {
		t.Fatalf("save config: %v", err)
	}

	raw, err := os.ReadFile(configFile)
	if err != nil {
		t.Fatalf("read saved config: %v", err)
	}

	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		t.Fatalf("unmarshal saved yaml: %v", err)
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 || root.Content[0] == nil {
		t.Fatalf("unexpected yaml root structure")
	}

	rootMap := root.Content[0]
	assertMissingMapKey(t, rootMap, "api-key-auth", "key-restricted")
	assertMissingMapKey(t, rootMap, "api-key-expiry", "key-restricted")
	assertMissingMapKey(t, rootMap, "proxy-routing-auth", "removed.json")
	assertHasMapKey(t, rootMap, "api-key-auth", "key-all")
	assertHasMapKey(t, rootMap, "api-key-expiry", "key-all")
	assertHasMapKey(t, rootMap, "proxy-routing-auth", "keep.json")
}

func assertMissingMapKey(t *testing.T, rootMap *yaml.Node, section, key string) {
	t.Helper()
	sectionIdx := findMapKeyIndex(rootMap, section)
	if sectionIdx < 0 {
		return
	}
	sectionValue := rootMap.Content[sectionIdx+1]
	if sectionValue == nil || sectionValue.Kind != yaml.MappingNode {
		return
	}
	if findMapKeyIndex(sectionValue, key) >= 0 {
		t.Fatalf("expected %q to be removed from %q", key, section)
	}
}

func assertHasMapKey(t *testing.T, rootMap *yaml.Node, section, key string) {
	t.Helper()
	sectionIdx := findMapKeyIndex(rootMap, section)
	if sectionIdx < 0 {
		t.Fatalf("expected section %q to exist", section)
	}
	sectionValue := rootMap.Content[sectionIdx+1]
	if sectionValue == nil || sectionValue.Kind != yaml.MappingNode {
		t.Fatalf("expected section %q to be a mapping", section)
	}
	if findMapKeyIndex(sectionValue, key) < 0 {
		t.Fatalf("expected key %q to exist in %q", key, section)
	}
}
