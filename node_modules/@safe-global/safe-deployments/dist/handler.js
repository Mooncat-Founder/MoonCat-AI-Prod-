"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFallbackHandlerDeployment = exports.getCompatibilityFallbackHandlerDeployments = exports.getCompatibilityFallbackHandlerDeployment = exports.getDefaultCallbackHandlerDeployments = exports.getDefaultCallbackHandlerDeployment = void 0;
const utils_1 = require("./utils");
const deployments_1 = require("./deployments");
/**
 * Get the default callback handler deployment based on the provided filter.
 * @param {DeploymentFilter} [filter] - Optional filter to apply to the deployment search.
 * @returns {SingletonDeployment | undefined} - The found deployment or undefined if not found.
 */
const getDefaultCallbackHandlerDeployment = (filter) => {
    return (0, utils_1.findDeployment)(filter, deployments_1._DEFAULT_CALLBACK_HANDLER_DEPLOYMENTS);
};
exports.getDefaultCallbackHandlerDeployment = getDefaultCallbackHandlerDeployment;
/**
 * Get all default callback handler deployments based on the provided filter.
 * @param {DeploymentFilter} [filter] - Optional filter to apply to the deployment search.
 * @returns {SingletonDeploymentV2 | undefined} - The found deployments in version 2 format or undefined if not found.
 */
const getDefaultCallbackHandlerDeployments = (filter) => {
    return (0, utils_1.findDeployment)(filter, deployments_1._DEFAULT_CALLBACK_HANDLER_DEPLOYMENTS, "multiple" /* DeploymentFormats.MULTIPLE */);
};
exports.getDefaultCallbackHandlerDeployments = getDefaultCallbackHandlerDeployments;
/**
 * Get the compatibility fallback handler deployment based on the provided filter.
 * @param {DeploymentFilter} [filter] - Optional filter to apply to the deployment search.
 * @returns {SingletonDeployment | undefined} - The found deployment or undefined if not found.
 */
const getCompatibilityFallbackHandlerDeployment = (filter) => {
    return (0, utils_1.findDeployment)(filter, deployments_1._COMPAT_FALLBACK_HANDLER_DEPLOYMENTS);
};
exports.getCompatibilityFallbackHandlerDeployment = getCompatibilityFallbackHandlerDeployment;
/**
 * Get all compatibility fallback handler deployments based on the provided filter.
 * @param {DeploymentFilter} [filter] - Optional filter to apply to the deployment search.
 * @returns {SingletonDeploymentV2 | undefined} - The found deployments in version 2 format or undefined if not found.
 */
const getCompatibilityFallbackHandlerDeployments = (filter) => {
    return (0, utils_1.findDeployment)(filter, deployments_1._COMPAT_FALLBACK_HANDLER_DEPLOYMENTS, "multiple" /* DeploymentFormats.MULTIPLE */);
};
exports.getCompatibilityFallbackHandlerDeployments = getCompatibilityFallbackHandlerDeployments;
/**
 * Get the fallback handler deployment based on the provided filter. This method is an alias for `getCompatibilityFallbackHandlerDeployment`.
 * Kept for backwards compatibility.
 * @param {DeploymentFilter} [filter] - Optional filter to apply to the deployment search.
 * @returns {SingletonDeployment | undefined} - The found deployment or undefined if not found.
 */
exports.getFallbackHandlerDeployment = exports.getCompatibilityFallbackHandlerDeployment;
// Leaving the comment here so it's not a part of the JSDoc
// Previously, the function code was this:
// // This is a sorted array (by preference)
// const fallbackHandlerDeployments: SingletonDeploymentJSON[] = [
//   CompatibilityFallbackHandler141,
//   CompatibilityFallbackHandler130,
//   DefaultCallbackHandler130,
// ];
// export const getFallbackHandlerDeployment = (filter?: DeploymentFilter): SingletonDeployment | undefined => {
//   return findDeployment(filter, fallbackHandlerDeployments);
// };
// The problem with the function is that there’s no possible filter that would make the function return the last element of the array
// (DefaultCallbackHandler130 ), since we only allow to filter by version, networks and released flag. The only possible way is to have
// the default callback handler deployed to a network where the compatibility fallback handler isn’t deployed, but we require the whole
// suite of the contracts be deployed to a network.
// Since we didn't want to enforce a preferred fallback handler on the deployments package level,
// we decided to alias it to getCompatibilityFallbackHandlerDeployment (previously returned value)
