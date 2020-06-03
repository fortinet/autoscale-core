import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide VPN connection attachment related logics
 */
export interface VpnAttachmentContext {
    handleVpnAttachment(): Promise<VpnAttachmentStrategyResult>;
    handleVpnDetachment(): Promise<VpnAttachmentStrategyResult>;
    setVpnAttachmentStrategy(strategy: VpnAttachmentStrategy): void;
}

export enum VpnAttachmentStrategyResult {
    Success = 'success',
    Failed = 'failed',
    ShouldTerminateVm = 'should-terminate-vm',
    ShouldContinue = 'should-continue'
}

export interface VpnAttachmentStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    attach(): Promise<VpnAttachmentStrategyResult>;
    detach(): Promise<VpnAttachmentStrategyResult>;
    cleanup(): Promise<number>;
}

export class NoopVpnAttachmentStrategy implements VpnAttachmentStrategy {
    cleanup(): Promise<number> {
        return Promise.resolve(0);
    }
    attach(): Promise<VpnAttachmentStrategyResult> {
        return Promise.resolve(VpnAttachmentStrategyResult.ShouldContinue);
    }
    detach(): Promise<VpnAttachmentStrategyResult> {
        return Promise.resolve(VpnAttachmentStrategyResult.ShouldContinue);
    }
    prepare(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        platform: PlatformAdapter,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        proxy: CloudFunctionProxyAdapter,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        vm: VirtualMachine
    ): Promise<void> {
        return Promise.resolve();
    }
}
