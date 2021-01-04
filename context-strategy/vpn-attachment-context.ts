import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { PlatformAdapter } from '../platform-adapter';
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
    prepare(vm: VirtualMachine): Promise<void>;
    attach(): Promise<VpnAttachmentStrategyResult>;
    detach(): Promise<VpnAttachmentStrategyResult>;
    cleanup(): Promise<number>;
}

export class NoopVpnAttachmentStrategy implements VpnAttachmentStrategy {
    constructor(readonly platform: PlatformAdapter, readonly proxy: CloudFunctionProxyAdapter) {}
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
        vm: VirtualMachine
    ): Promise<void> {
        return Promise.resolve();
    }
}
