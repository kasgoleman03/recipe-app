// Package cache provides a tiny, dependency-free, generic TTL cache.
//
// It is used for slow-changing proxied data (specifically the categories
// list from TheMealDB). It is intentionally simple: no eviction policy,
// no background sweeper — entries simply expire on read.
package cache

import (
	"sync"
	"time"
)

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

type Cache[V any] struct {
	mu sync.RWMutex
	m  map[string]entry[V]
}

func New[V any]() *Cache[V] {
	return &Cache[V]{m: make(map[string]entry[V])}
}

// Get returns the cached value if present and not expired.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.RLock()
	e, ok := c.m[key]
	c.mu.RUnlock()
	var zero V
	if !ok {
		return zero, false
	}
	if time.Now().After(e.expiresAt) {
		c.mu.Lock()
		delete(c.m, key)
		c.mu.Unlock()
		return zero, false
	}
	return e.value, true
}

// Set stores value under key for the given TTL.
func (c *Cache[V]) Set(key string, value V, ttl time.Duration) {
	c.mu.Lock()
	c.m[key] = entry[V]{value: value, expiresAt: time.Now().Add(ttl)}
	c.mu.Unlock()
}
