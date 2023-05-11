// new BaseError( internalErrorString, message );
// new BaseError( err, internalErrorString, message );
export default class BaseError extends Error {
  causedByMessage = "";
  cause?: Error | undefined;

  constructor(...args: any) {
    super(...args);
    Error.captureStackTrace(this, this.constructor);

    const parsedArguments = this._parseArguments(args);
    const { cause, message } = parsedArguments;

    if (cause) this.cause = cause;

    this.message = this.name;
    if (message) this.message += ": " + message;
    const causedByMessage =
      this.cause && this.cause.message ? this.cause.message : "";
    if (this.causedByMessage) this.message += "; caused by " + causedByMessage;
  }

  fullStack() {
    let stackTraceString = this.stack;

    if (this.cause) {
      stackTraceString += "\ncaused by: ";
      if (this.cause instanceof BaseError && this.cause.fullStack) {
        stackTraceString += this.cause.fullStack() || "";
      } else {
        stackTraceString += this.cause.stack || "";
      }

      return stackTraceString;
    }

    return stackTraceString;
  }

  _parseArguments(args: any) {
    let cause;
    let message = "";

    if (args.length !== 0 && args[0] instanceof Error) {
      cause = args[0];
      args.shift();
    }

    if (args.length && args[0]) {
      if (!(typeof args[0] === "string")) {
        throw new TypeError(
          "Invalid arguments to error constructor. Expecting [ cause ], [ message ]",
        );
      }

      message = args[0];
    }

    return {
      cause,
      message,
    };
  }
}
