import SafeProvider from '../SafeProvider';
import { CompatibilityFallbackHandlerContractImplementationType, ContractNetworkConfig, CreateCallContractImplementationType, DeploymentType, MultiSendCallOnlyContractImplementationType, MultiSendContractImplementationType, SafeContractImplementationType, SafeProxyFactoryContractImplementationType, SafeWebAuthnSharedSignerContractImplementationType, SafeWebAuthnSignerFactoryContractImplementationType, SignMessageLibContractImplementationType, SimulateTxAccessorContractImplementationType } from '../types';
import { SafeVersion } from '@safe-global/types-kit';
export interface GetContractInstanceProps {
    safeProvider: SafeProvider;
    safeVersion: SafeVersion;
    customContracts?: ContractNetworkConfig;
    deploymentType?: DeploymentType;
}
export interface GetSafeContractInstanceProps extends GetContractInstanceProps {
    isL1SafeSingleton?: boolean;
    customSafeAddress?: string;
}
export declare function getSafeContract({ safeProvider, safeVersion, customSafeAddress, isL1SafeSingleton, customContracts, deploymentType }: GetSafeContractInstanceProps): Promise<SafeContractImplementationType>;
export declare function getSafeProxyFactoryContract({ safeProvider, safeVersion, customContracts, deploymentType }: GetContractInstanceProps): Promise<SafeProxyFactoryContractImplementationType>;
export declare function getCompatibilityFallbackHandlerContract({ safeProvider, safeVersion, customContracts, deploymentType }: GetContractInstanceProps): Promise<CompatibilityFallbackHandlerContractImplementationType>;
export declare function getMultiSendContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<MultiSendContractImplementationType>;
export declare function getMultiSendCallOnlyContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<MultiSendCallOnlyContractImplementationType>;
export declare function getSignMessageLibContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<SignMessageLibContractImplementationType>;
export declare function getCreateCallContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<CreateCallContractImplementationType>;
export declare function getSimulateTxAccessorContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<SimulateTxAccessorContractImplementationType>;
export declare function getSafeWebAuthnSignerFactoryContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<SafeWebAuthnSignerFactoryContractImplementationType>;
export declare function getSafeWebAuthnSharedSignerContract({ safeProvider, safeVersion, customContracts }: GetContractInstanceProps): Promise<SafeWebAuthnSharedSignerContractImplementationType>;
