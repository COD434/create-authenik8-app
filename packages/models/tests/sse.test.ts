import { describe, expect, it } from "vitest";

import { parseSseEvents } from "../src/sse.js";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const events: string[] = [];
  for await (const event of parseSseEvents(stream)) events.push(event);
  return events;
}

describe("sse parser", () => {
  it("yields data payloads and ignores comments and metadata lines", async () => {
    const events = await collect(
      streamFrom([": keep-alive\nevent: ping\ndata: one\ndata:two\nid: 1\nretry: 100\n"]),
    );
    expect(events).toEqual(["one", "two"]);
  });

  it("buffers data lines split across stream chunks", async () => {
    const events = await collect(streamFrom(["data: hel", "lo\ndata: [", "DONE]\n"]));
    expect(events).toEqual(["hello", "[DONE]"]);
  });

  it("flushes a trailing data line that never got a newline", async () => {
    const events = await collect(streamFrom(['data: {"a"']));
    expect(events).toEqual(['{"a"']);
  });

  it("yields nothing for an empty stream", async () => {
    const events = await collect(streamFrom([""]));
    expect(events).toEqual([]);
  });
});
