import BaseError from "./baseError";
import { serialize } from "./serializer";

class orchestratorError extends BaseError {}

const errors = {
  orchestratorError,
};

export default {
  serialize,
  errors,
};
