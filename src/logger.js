export function log(level, message, extra = undefined) {
  if (level !== "error") {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
  };

  if (extra !== undefined) {
    payload.extra = extra;
  }

  const line = JSON.stringify(payload);
  console.error(line);
}

export const logger = {
  info(message, extra) {
    log("info", message, extra);
  },
  warn(message, extra) {
    log("warn", message, extra);
  },
  error(message, extra) {
    log("error", message, extra);
  },
};
