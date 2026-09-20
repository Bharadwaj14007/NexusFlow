export class AppError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
