export interface HttpErrorOptions extends ErrorOptions {
  status?: number;
}

export class ApiException extends Error {
  readonly status: number;
  constructor(message: string, options?: HttpErrorOptions | number) {
    super(message, typeof options === 'object' ? options : undefined);
    this.status =
      (typeof options === 'object' ? options?.status : options) || 500;
  }
}
