export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (m = "Invalid request") => new AppError(m, 400, "BAD_REQUEST");
export const unauthorized = (m = "You must be signed in") => new AppError(m, 401, "UNAUTHORIZED");
export const forbidden = (m = "You do not have permission to perform this action") => new AppError(m, 403, "FORBIDDEN");
export const notFound = (m = "Not found") => new AppError(m, 404, "NOT_FOUND");
export const conflict = (m: string) => new AppError(m, 409, "CONFLICT");
