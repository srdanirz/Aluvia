// TODO(#23): stub of feat/observability's logger, same signatures. `message` is a stable
// snake_case code; `fields` carry ids and enums only, never personal data.

type Fields = Record<string, unknown>;

function write(severity: "ERROR" | "WARNING" | "INFO", message: string, fields?: Fields, error?: unknown) {
  const detail = error instanceof Error ? { error: error.name, stack: error.stack } : {};
  process.stdout.write(`${JSON.stringify({ severity, message, ...detail, ...fields })}\n`);
}

export function logError(message: string, error: unknown, fields?: Fields) {
  write("ERROR", message, fields, error);
}

export function logWarn(message: string, fields?: Fields) {
  write("WARNING", message, fields);
}

export function logInfo(message: string, fields?: Fields) {
  write("INFO", message, fields);
}
