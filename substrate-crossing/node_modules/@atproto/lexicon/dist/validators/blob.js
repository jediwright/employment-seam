import { BlobRef } from '../blob-refs.js';
import { ValidationError } from '../types.js';
export function blob(lexicons, path, def, value) {
    // check
    if (!value || !(value instanceof BlobRef)) {
        return {
            success: false,
            error: new ValidationError(`${path} should be a blob ref`),
        };
    }
    return { success: true, value };
}
//# sourceMappingURL=blob.js.map