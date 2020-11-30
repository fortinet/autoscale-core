import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { AutoscaleEnvironment } from '../autoscale-environment';

export interface FazIntegrationStrategy {
    apply(): Promise<void>;
}

export class FazReactiveRegsitrationStrategy implements FazIntegrationStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    constructor(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ) {
        this.platform = platform;
        this.proxy = proxy;
        this.env = env;
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.apply.');
        // TODO: require implementation
        this.proxy.logAsInfo('called FazReactiveRegsitrationStrategy.apply.');
        return Promise.resolve();
    }
}

export class NoopFazIntegrationStrategy implements FazIntegrationStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    constructor(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    apply(): Promise<void> {
        this.proxy.logAsInfo('calling NoopFazIntegrationStrategy.apply.');
        this.proxy.logAsInfo('called NoopFazIntegrationStrategy.apply.');
        return Promise.resolve();
    }
}
