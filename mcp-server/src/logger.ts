// Structured JSON logger for tool calls. Every MCP tool invocation gets logged
// with user identity, tool name, object type, and record IDs.
// Output goes to stdout — Railway captures it automatically.

interface ToolCallLog {
  user: string;
  tool: string;
  objectType?: string;
  recordIds?: string[];
}

export function logToolCall(entry: ToolCallLog): void {
  const log = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  console.log(JSON.stringify(log));
}
