import { ApiError, AuthError, RateLimitError } from "./errors.js";
import type { ApiRequestOptions } from "./types.js";

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 2;

export async function apiRequest<T = unknown>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 401) {
        throw new AuthError("Access token is invalid or expired");
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        if (attempt < retries) {
          await sleep(retryMs);
          continue;
        }
        throw new RateLimitError("Rate limit exceeded", retryMs);
      }

      const errorBody = await response.text();
      throw new ApiError(
        `API returned ${response.status}: ${errorBody}`,
        response.status
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        error instanceof AuthError ||
        error instanceof RateLimitError ||
        error instanceof ApiError
      ) {
        throw error;
      }
      if (attempt < retries) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
