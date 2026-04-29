/**
 * In-memory cache for model context length metadata.
 *
 * Populated during upstream model discovery when the upstream /v1/models
 * response includes per-model context_length (or similar fields).
 * Used by the /v1/models surface to enrich the downstream response.
 *
 * Default context length: 1_000_000 (1M tokens) when upstream does not provide one.
 */

const DEFAULT_CONTEXT_LENGTH = 1_000_000;

const cache = new Map<string, number>();

function normalizeKey(modelName: string): string {
  return modelName.trim().toLowerCase();
}

/**
 * Store context length for a single model.
 */
export function setModelContextLength(modelName: string, contextLength: number): void {
  if (!modelName || !Number.isFinite(contextLength) || contextLength <= 0) return;
  cache.set(normalizeKey(modelName), Math.round(contextLength));
}

/**
 * Bulk-store context lengths from a map (e.g. extracted from upstream payload).
 */
export function setModelContextLengths(entries: Map<string, number>): void {
  for (const [name, length] of entries) {
    if (name && Number.isFinite(length) && length > 0) {
      cache.set(normalizeKey(name), Math.round(length));
    }
  }
}

/**
 * Get context length for a model. Returns the default if not found.
 */
export function getModelContextLength(modelName: string): number {
  return cache.get(normalizeKey(modelName)) ?? DEFAULT_CONTEXT_LENGTH;
}

/**
 * Check if a model has an explicit context length in the cache.
 */
export function hasModelContextLength(modelName: string): boolean {
  return cache.has(normalizeKey(modelName));
}

/**
 * Get all cached entries (for diagnostics).
 */
export function getAllModelContextLengths(): ReadonlyMap<string, number> {
  return cache;
}

/**
 * Clear the cache (for testing or refresh).
 */
export function clearModelContextLengthCache(): void {
  cache.clear();
}

/**
 * Extract context lengths from an OpenAI-compatible /v1/models payload.
 *
 * Looks for context_length on each item in data[]. If none of the items
 * carry context_length, returns an empty map (caller should fall back to default).
 */
export function extractContextLengthsFromPayload(payload: unknown): Map<string, number> {
  const result = new Map<string, number>();
  if (!payload || typeof payload !== 'object') return result;

  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data)) return result;

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;

    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id) continue;

    // Try multiple field names that upstreams may use
    const contextLength = pickPositiveInt(record, [
      'context_length',
      'contextLength',
      'max_context_length',
      'maxContextLength',
      'context_window',
      'contextWindow',
    ]);

    if (contextLength > 0) {
      result.set(id, contextLength);
    }
  }

  return result;
}

function pickPositiveInt(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
  }
  return 0;
}
