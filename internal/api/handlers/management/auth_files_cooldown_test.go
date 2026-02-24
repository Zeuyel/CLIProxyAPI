package management

import (
	"testing"
	"time"

	coreauth "github.com/router-for-me/CLIProxyAPI/v6/sdk/cliproxy/auth"
)

func TestResolveAuthCooldown_PrefersEarliestRecoverTime(t *testing.T) {
	now := time.Now()
	weekly := now.Add(7 * 24 * time.Hour)
	fiveHours := now.Add(5 * time.Hour)
	auth := &coreauth.Auth{
		Quota: coreauth.QuotaState{
			Exceeded:      true,
			Reason:        "codex_weekly_limit",
			NextRecoverAt: weekly,
		},
		ModelStates: map[string]*coreauth.ModelState{
			"gpt-5": {
				Quota: coreauth.QuotaState{
					Exceeded:      true,
					Reason:        "codex_5h_limit",
					NextRecoverAt: fiveHours,
				},
			},
		},
	}

	active, reason, until := resolveAuthCooldown(auth, now)
	if !active {
		t.Fatalf("expected cooldown to be active")
	}
	if reason != "codex_5h_limit" {
		t.Fatalf("expected earliest reason codex_5h_limit, got %q", reason)
	}
	if !until.Equal(fiveHours) {
		t.Fatalf("expected earliest recover time %v, got %v", fiveHours, until)
	}
}

func TestResolveAuthCooldown_IgnoresExpiredQuota(t *testing.T) {
	now := time.Now()
	auth := &coreauth.Auth{
		Quota: coreauth.QuotaState{
			Exceeded:      true,
			Reason:        "codex_5h_limit",
			NextRecoverAt: now.Add(-1 * time.Minute),
		},
	}
	active, reason, until := resolveAuthCooldown(auth, now)
	if active {
		t.Fatalf("expected cooldown to be inactive, got reason=%q until=%v", reason, until)
	}
}
