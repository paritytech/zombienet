
import BaseError from "./baseError.ts";
import { serialize } from "./serializer.ts";

class orchestratorError extends BaseError {}

const errors = {
    orchestratorError
}

export default {
    serialize,
    errors
}