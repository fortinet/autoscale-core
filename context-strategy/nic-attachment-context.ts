import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

/**
 * To provide secondary network interface attachment related logics
 */
export interface NicAttachmentContext {
    handleNicAttachment(): Promise<string>;
    handleNicDetachment(): Promise<string>;
    cleanupUnusedNic(): Promise<string>;
    setNicAttachmentStrategy(strategy: NicAttachmentStrategy): void;
}

export enum NicAttachmentResult {
    Success = 'success',
    Failed = 'failed'
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
    attach(): Promise<NicAttachmentResult>;
    detach(): Promise<NicAttachmentResult>;
    cleanUp(): Promise<void>;
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
    attach(): Promise<NicAttachmentResult> {
        return Promise.resolve(NicAttachmentResult.Success);
    }
    detach(): Promise<NicAttachmentResult> {
        return Promise.resolve(NicAttachmentResult.Success);
    }
    cleanUp(): Promise<void> {
        return Promise.resolve();
    }
}
