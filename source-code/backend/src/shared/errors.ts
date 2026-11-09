export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function check(condition: unknown, message: string, code = 'INVALID_OPERATION', status = 409): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
