package auth

import "context"

type sessionIDContextKey struct{}

// WithSessionID stores the session identifier in the context.
func WithSessionID(ctx context.Context, sessionID string) context.Context {
	if ctx == nil || sessionID == "" {
		return ctx
	}
	return context.WithValue(ctx, sessionIDContextKey{}, sessionID)
}

// SessionIDFromContext returns the session identifier stored in the context.
func SessionIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if value, ok := ctx.Value(sessionIDContextKey{}).(string); ok {
		return value
	}
	return ""
}
