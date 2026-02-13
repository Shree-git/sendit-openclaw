export interface SendItError {
  code: string;
  message: string;
  retryable?: boolean;
  status?: number;
}

export interface SendItEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: SendItError;
}

export function ok<T>(data: T): SendItEnvelope<T> {
  return { success: true, data };
}

export function fail(params: {
  code: string;
  message: string;
  retryable?: boolean;
  status?: number;
}): SendItEnvelope<never> {
  return {
    success: false,
    error: {
      code: params.code,
      message: params.message,
      retryable: params.retryable,
      status: params.status,
    },
  };
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function toToolResult(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}
