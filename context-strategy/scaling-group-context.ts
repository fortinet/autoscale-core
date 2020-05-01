import { PlatformAdapter } from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';

/**
 * To provide auto scaling group related logics such as scaling out, scaling in.
 */
export interface ScalingGroupContext {
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void;
    handleLaunchingVm(): Promise<string>;
    handleLaunchedVm(): Promise<string>;
    handleTerminatingVm(): Promise<string>;
    handleTerminatedVm(): Promise<string>;
}

export interface ScalingGroupStrategy {
    prepare(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter): Promise<void>;
    onLaunchingVm(): Promise<string>;
    onLaunchedVm(): Promise<string>;
    onTerminatingVm(): Promise<string>;
    onTerminatedVm(): Promise<string>;
}

export class NoopScalingGroupStrategy implements ScalingGroupStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    prepare(platform: PlatformAdapter, proxy: CloudFunctionProxyAdapter): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        return Promise.resolve();
    }
    onLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on launching.');
        return Promise.resolve('');
    }
    onLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on launched.');
        return Promise.resolve('');
    }
    onTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on terminating.');
        return Promise.resolve('');
    }
    onTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('Noop on terminated.');
        return Promise.resolve('');
    }
}
