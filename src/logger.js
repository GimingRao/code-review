export function log(level, message, extra = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
  };

  if (extra !== undefined) {
    payload.extra = extra;
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
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
