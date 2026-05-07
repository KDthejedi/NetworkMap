/**
 * snake_case serializer for API responses (spec section 9 contract).
 * Drizzle returns camelCase TS keys; we convert at the API boundary.
 */
export function toSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[snakeKey(k)] = toSnake(v);
    }
    return out;
  }
  return obj;
}

export function snakeKey(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function toCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamel);
  if (obj && typeof obj === "object" && !(obj instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[camelKey(k)] = toCamel(v);
    }
    return out;
  }
  return obj;
}

export function camelKey(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
