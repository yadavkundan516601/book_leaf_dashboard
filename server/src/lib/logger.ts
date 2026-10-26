import { pino, type Logger } from "pino";

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    // Never log credentials or session tokens, even at debug level.
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']", "*.password", "*.passwordHash"],
      censor: "[redacted]",
    },
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } } : {}),
  });
}

export type { Logger };
