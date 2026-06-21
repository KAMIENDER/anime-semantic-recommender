import { config } from "../config.js";

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  retries = 1,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: "application/json",
          "user-agent": config.userAgent,
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    }
  }

  throw new SourceError(`Failed to fetch ${url}`, lastError);
}
