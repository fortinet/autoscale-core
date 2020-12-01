import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';

export interface FazDeviceRegistration {
    vmId: string;
    privateIp: string;
    publicIp: string;
}

export interface FazIntegrationStrategy {
    registerDevice(vm: VirtualMachine): Promise<void>;
    authorizeDevice(
        device: FazDeviceRegistration,
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
    registerDevice(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.registerDevice.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.registerDevice.');
        return Promise.resolve();
    }

    authorizeDevice(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.authorizeDevice.');
        this.proxy.logAsInfo('no operation required.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.authorizeDevice.');
        return Promise.resolve();
    }
}
