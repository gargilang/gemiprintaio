/**
 * Error guard otorisasi. Dipisah ke modul sendiri (tanpa import) supaya bisa
 * dipakai helper dan unit test tanpa menarik rantai session.ts → jose (ESM).
 */
export class AuthGuardError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthGuardError";
    this.status = status;
  }
}
