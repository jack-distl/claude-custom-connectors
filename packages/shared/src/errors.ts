export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "ConnectorError";
  }

  toToolResult() {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: this.code,
            message: this.message,
            ...(this.statusCode && { statusCode: this.statusCode }),
          }),
        },
      ],
      isError: true,
    };
  }
}

export class AuthError extends ConnectorError {
  constructor(message: string) {
    super(message, "AUTH_ERROR", 401);
    this.name = "AuthError";
  }
}

export class RateLimitError extends ConnectorError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number
  ) {
    super(message, "RATE_LIMIT", 429);
    this.name = "RateLimitError";
  }
}

export class ApiError extends ConnectorError {
  constructor(message: string, statusCode: number) {
    super(message, "API_ERROR", statusCode);
    this.name = "ApiError";
  }
}
