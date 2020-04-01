import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide secondary network interface attachment related logics
 */
export interface NicAttachmentContext {
    handleNicAttachment(): Promise<NicAttachmentStrategyResult>;
    handleNicDetachment(): Promise<NicAttachmentStrategyResult>;
    cleanupUnusedNic(): Promise<NicAttachmentStrategyResult>;
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void;
}

export enum NicAttachmentStrategyResult {
    Success = 'success',
    Failed = 'failed',
    ShouldTerminateVm = 'should-terminate-vm',
    ShouldContinue = 'should-continue'
}

export enum NicAttachmentStatus {
    Attaching = 'Attaching',
    Attached = 'Attached',
    Detaching = 'Detaching',
    Detached = 'Detached'
}

export interface NicAttachmentRecord {
    vmId: string;
    nicId: string;
    attachmentState: string;
}

export interface NicAttachmentStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    attach(): Promise<NicAttachmentStrategyResult>;
    detach(): Promise<NicAttachmentStrategyResult>;
    cleanUp(): Promise<number>;
}

export class NoopNicAttachmentStrategy implements NicAttachmentStrategy {
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
    attach(): Promise<NicAttachmentStrategyResult> {
        return Promise.resolve(NicAttachmentStrategyResult.Success);
    }
    detach(): Promise<NicAttachmentStrategyResult> {
        return Promise.resolve(NicAttachmentStrategyResult.Success);
    }
    cleanUp(): Promise<number> {
        return Promise.resolve(0);
    }
}
