"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSafeOperationResponse = exports.isSafeOperation = exports.OperationType = void 0;
var OperationType;
(function (OperationType) {
    OperationType[OperationType["Call"] = 0] = "Call";
    OperationType[OperationType["DelegateCall"] = 1] = "DelegateCall"; // 1
})(OperationType || (exports.OperationType = OperationType = {}));
const isSafeOperation = (response) => {
    const safeOperation = response;
    return 'data' in safeOperation && 'signatures' in safeOperation;
};
exports.isSafeOperation = isSafeOperation;
const isSafeOperationResponse = (response) => {
    const safeOperationResponse = response;
    return 'userOperation' in safeOperationResponse && 'safeOperationHash' in safeOperationResponse;
};
exports.isSafeOperationResponse = isSafeOperationResponse;
//# sourceMappingURL=types.js.map