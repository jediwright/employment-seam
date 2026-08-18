import { object, validateOneOf } from './validators/complex.js';
import { params } from './validators/xrpc.js';
export function assertValidRecord(lexicons, def, value) {
    const res = object(lexicons, 'Record', def.record, value);
    if (!res.success)
        throw res.error;
    return res.value;
}
export function assertValidXrpcParams(lexicons, def, value) {
    if (def.parameters) {
        const res = params(lexicons, 'Params', def.parameters, value);
        if (!res.success)
            throw res.error;
        return res.value;
    }
}
export function assertValidXrpcInput(lexicons, def, value) {
    if (def.input?.schema) {
        // loop: all input schema definitions
        return assertValidOneOf(lexicons, 'Input', def.input.schema, value, true);
    }
}
export function assertValidXrpcOutput(lexicons, def, value) {
    if (def.output?.schema) {
        // loop: all output schema definitions
        return assertValidOneOf(lexicons, 'Output', def.output.schema, value, true);
    }
}
export function assertValidXrpcMessage(lexicons, def, value) {
    if (def.message?.schema) {
        // loop: all output schema definitions
        return assertValidOneOf(lexicons, 'Message', def.message.schema, value, true);
    }
}
function assertValidOneOf(lexicons, path, def, value, mustBeObj = false) {
    const res = validateOneOf(lexicons, path, def, value, mustBeObj);
    if (!res.success)
        throw res.error;
    return res.value;
}
//# sourceMappingURL=validation.js.map