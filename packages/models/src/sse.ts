/**
 * Minimal server-sent-events line parser for provider streaming responses.
 *
 * Yields the `data:` payload of every event as a string. Comment lines
 * (`: keep-alive`), `event:`, `id:`, and `retry:` lines are ignored. Multi-
 * line data events are joined with newlines per the SSE specification.
 */

export async function* parseSseEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLines = function* (flush: boolean): Generator<string> {
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
      buffer = buffer.slice(lineEnd + 1);
      if (line.startsWith("data:")) {
        const data = line.slice(5);
        const trimmed = data.startsWith(" ") ? data.slice(1) : data;
        if (trimmed.length > 0) yield trimmed;
      }
      lineEnd = buffer.indexOf("\n");
    }
    if (flush && buffer.startsWith("data:")) {
      const data = buffer.slice(5);
      const trimmed = data.startsWith(" ") ? data.slice(1) : data;
      if (trimmed.length > 0) yield trimmed;
      buffer = "";
    }
  };

  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* emitLines(false);
    }
    buffer += decoder.decode();
    yield* emitLines(true);
  } finally {
    reader.releaseLock();
  }
}
