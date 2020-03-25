import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';

/**
 * To provide VPN connection attachment related logics
 */
export interface VpnAttachmentContext {
    handleVpnAttachment(): Promise<string>;
    handleVpnDetachment(): Promise<string>;
    cleanupUnusedVpn(): Promise<string>;
    setVpnAttachmentStrategy(strategy: VpnAttachmentStrategy): void;
}

export interface VpnAttachmentStrategy {
    prepare(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter): Promise<void>;
    apply(): Promise<string>;
}

export class NoopVpnAttachmentStrategy implements VpnAttachmentStrategy {
    prepare(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter): Promise<void> {
        return Promise.resolve();
    }
    apply(): Promise<string> {
        return Promise.resolve('');
    }
}
