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
