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
 * instead of crashing the JSON-RPC dispatch. The result type is generic so
 * image-returning tools (e.g. `dosbox_screenshot`) can return `ImageToolResult`
 * alongside the more common `JsonToolResult`.
 */
export function safeHandler<Args, R extends JsonToolResult | ImageToolResult = JsonToolResult>(
  fn: (args: Args) => R | Promise<R>,
): (args: Args) => Promise<R | JsonToolResult> {
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

/**
 * MCP image content block. Returned by `imageResult` for tools that surface
 * binary captures like screenshots. The MCP SDK accepts this alongside text
 * content blocks in the tool-result `content` array.
 */
export interface ImageToolResult {
  [key: string]: unknown;
  content: { type: 'image'; mimeType: string; data: string }[];
  isError?: boolean;
}

/** Format a binary image result (PNG, etc.). `bytes` is base64-encoded. */
export function imageResult(bytes: Buffer, mimeType: string): ImageToolResult {
  return {
    content: [{ type: 'image', mimeType, data: bytes.toString('base64') }],
  };
}

/** Convert a byte buffer to space-separated lowercase hex pairs. */
export function bytesToHexPairs(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const b of bytes) out.push(b.toString(16).padStart(2, '0'));
  return out.join(' ');
}
