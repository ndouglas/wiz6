// Helpers for shaping MCP tool results.
//
// Tool callbacks must return a CallToolResult-shape object with at least
// `content: TextContent[]`. We also include `structuredContent` (the
// parsed object) so a future tool with an outputSchema doesn't need to
// double-render. Errors set `isError: true` with a clear text message.

export interface JsonToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: { [key: string]: unknown };
  isError?: boolean;
}

/** Format a successful JSON result. */
export function jsonResult(payload: { [key: string]: unknown }): JsonToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

/** Format an error result. `isError` is true; the message is human-readable. */
export function errorResult(message: string, details?: unknown): JsonToolResult {
  const payload: { [key: string]: unknown } =
    details === undefined ? { error: message } : { error: message, details };
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true,
  };
}

/**
 * Wrap a tool handler so any thrown error becomes a clean isError result
 * instead of crashing the JSON-RPC dispatch.
 */
export function safeHandler<Args>(
  fn: (args: Args) => JsonToolResult | Promise<JsonToolResult>,
): (args: Args) => Promise<JsonToolResult> {
  return async (args: Args) => {
    try {
      return await fn(args);
    } catch (err) {
      const message =
        err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return errorResult(message);
    }
  };
}

/** Convert a byte buffer to space-separated lowercase hex pairs. */
export function bytesToHexPairs(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const b of bytes) out.push(b.toString(16).padStart(2, '0'));
  return out.join(' ');
}
