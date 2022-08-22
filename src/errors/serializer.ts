import BaseError from "./baseError";

export function serialize(err: Error | BaseError) {
  const serializedObject: any = {
    errorClass: err.constructor.name,
    name: err.name,
    stack: err.stack,
  };

  if (err.message) serializedObject.message = err.message;

  if (err instanceof BaseError && err.cause) {
    serializedObject.cause = serialize(err.cause);
  }

  return serializedObject;
}
