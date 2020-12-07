import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { PlatformAdapter } from '../platform-adapter';
import { VirtualMachine } from '../virtual-machine';

export interface FazDeviceAuthorization {
    vmId: string;
    privateIp: string;
    publicIp: string;
}

export interface FazIntegrationStrategy {
    createAuthorizationRequest(vm: VirtualMachine): Promise<void>;
    processAuthorizationRequest(
        device: FazDeviceAuthorization,
        host: string,
        port: string,
        username: string,
        password: string
    ): Promise<void>;
}

export class NoopFazIntegrationStrategy implements FazIntegrationStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    createAuthorizationRequest(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.createAuthorizationRequest.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.createAuthorizationRequest.');
        return Promise.resolve();
    }

    processAuthorizationRequest(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.processAuthorizationRequest.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.processAuthorizationRequest.');
        return Promise.resolve();
    }
}
