const Cache = require('../cache');

describe('Cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache(100); // 100ms TTL for testing
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    cache.destroy();
  });

  test('should store and retrieve values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  test('should return null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  test('should expire items after TTL', () => {
    cache.set('key1', 'value1');

    // Advance time past TTL
    jest.advanceTimersByTime(101);

    expect(cache.get('key1')).toBeNull();
  });

  test('should respect custom TTL', () => {
    cache.set('key1', 'value1', 200); // 200ms TTL

    // Advance time past default TTL but before custom TTL
    jest.advanceTimersByTime(150);

    expect(cache.get('key1')).toBe('value1');

    // Advance time past custom TTL
    jest.advanceTimersByTime(51);

    expect(cache.get('key1')).toBeNull();
  });

  test('should delete keys', () => {
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeNull();
  });

  test('should clear all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });

  test('should check if key exists', () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('nonexistent')).toBe(false);
  });

  test('should cleanup expired items', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2', 200); // longer TTL

    // Advance time past first TTL
    jest.advanceTimersByTime(150);

    // Run cleanup
    cache.cleanup();

    // key1 should be gone, key2 should remain
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBe('value2');
  });

  test('should return cache stats', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    const stats = cache.getStats();
    expect(stats).toHaveProperty('size', 2);
    expect(stats).toHaveProperty('lastCleanup');
  });
});
