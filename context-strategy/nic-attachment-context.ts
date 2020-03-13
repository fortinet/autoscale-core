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

export enum NicAttachmentStatus {
    Attaching = 'Attaching',
    Attached = 'Attached',
    Detaching = 'Detaching',
    Detached = 'Detached'
}

export interface NicAttachmentRecord {
    instanceId: string;
    nicId: string;
    attachmentState: string;
}

export interface NicAttachmentStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void>;
    apply(): Promise<void>;
}

export class NoOpNicAttachmentStrategy implements NicAttachmentStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine
    ): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<void> {
        return Promise.resolve();
    }
}
