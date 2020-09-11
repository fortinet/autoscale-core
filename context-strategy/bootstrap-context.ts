export interface BootstrapContext {
    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void;
    handleBootstrap(): Promise<string>;
}

export enum BootstrapConfigStrategyResult {
    SUCCESS,
    FAILED
}

export interface BootstrapConfigurationStrategy {
    getConfiguration(): string;
    apply(): Promise<BootstrapConfigStrategyResult>;
}
