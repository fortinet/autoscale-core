import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide VPN connection attachment related logics
 */
export interface VpnAttachmentContext {
    handleVpnAttachment(): Promise<VpnAttachmentStrategyResult>;
    handleVpnDetachment(): Promise<VpnAttachmentStrategyResult>;
    cleanupUnusedVpn(): Promise<VpnAttachmentStrategyResult>;
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
    cleanUp(): Promise<VpnAttachmentStrategyResult>;
}

export class NoopVpnAttachmentStrategy implements VpnAttachmentStrategy {
    attach(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    detach(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    cleanUp(): Promise<void> {
        throw new Error('Method not implemented.');
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
