import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { AutoscaleEnvironment } from '../autoscale-core';
export interface BootstrapContext {
    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void;
    handleBootstrap(): Promise<string>;
}

export enum BootstrapConfigStrategyResult {
    SUCCESS,
    FAILED
}

export interface BootstrapConfigurationStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        env: AutoscaleEnvironment
    ): Promise<void>;
    getConfiguration(): string;
    apply(): Promise<BootstrapConfigStrategyResult>;
}
