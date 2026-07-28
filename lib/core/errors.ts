export type AppErrorCode =
  | "CONFIGURATION_REQUIRED"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_DATA";

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: AppErrorCode,
    readonly status: number,
    readonly provider?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigurationError extends AppError { constructor(message: string, provider?: string) { super(message, "CONFIGURATION_REQUIRED", 503, provider); } }
export class AuthenticationError extends AppError { constructor(message = "Bạn cần đăng nhập.") { super(message, "AUTHENTICATION_REQUIRED", 401); } }
export class AuthorizationError extends AppError { constructor(message = "Bạn không có quyền thực hiện thao tác này.") { super(message, "FORBIDDEN", 403); } }
export class ProviderError extends AppError { constructor(message: string, provider: string, retryable = true) { super(message, "PROVIDER_ERROR", 503, provider, retryable); } }
export class RateLimitError extends AppError { constructor(message = "Đã vượt giới hạn yêu cầu.") { super(message, "RATE_LIMITED", 429, undefined, true); } }
export class ValidationError extends AppError { constructor(message = "Dữ liệu không hợp lệ.") { super(message, "VALIDATION_ERROR", 400); } }
export class NotFoundError extends AppError { constructor(message = "Không tìm thấy dữ liệu.") { super(message, "NOT_FOUND", 404); } }
export class ConflictError extends AppError { constructor(message = "Dữ liệu bị xung đột.") { super(message, "CONFLICT", 409); } }
export class StaleDataError extends AppError { constructor(message = "Dữ liệu có thể đã cũ.", provider?: string) { super(message, "STALE_DATA", 200, provider, true); } }

export function toSafeError(error: unknown): { code: AppErrorCode | "INTERNAL_ERROR"; message: string; status: number; retryable: boolean } {
  if (error instanceof AppError) return { code: error.code, message: error.message, status: error.status, retryable: error.retryable };
  return { code: "INTERNAL_ERROR", message: "Dịch vụ tạm thời không khả dụng.", status: 503, retryable: true };
}

