export class CommandError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "CommandError";
    this.code = code;
  }
}
