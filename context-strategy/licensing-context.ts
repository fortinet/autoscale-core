import {
    PlatformAdapter,
    LicenseStockRecord,
    LicenseUsageMap,
    LicenseFileMap,
    LicenseStockMap,
    LicenseUsageRecord,
    LicenseFile
} from '../platform-adapter';
import { CloudFunctionProxyAdapter } from '../cloud-function-proxy';
import { VirtualMachine } from '../virtual-machine';
import { Blob } from '../blob';

export enum LicensingStrategyResult {
    LicenseAssigned = 'license-assigned',
    LicenseOutOfStock = 'license-out-of-stock',
    LicenseNotRequired = 'license-not-required'
}

/**
 * To provide Licensing model related logics such as license assignment.
 */
export interface LicensingModelContext {
    setLicensingStrategy(strategy: LicensingStrategy): void;
    handleLicenseAssignment(): Promise<string>;
}

export interface LicensingStrategy {
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine,
        productName: string,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void>;
    apply(): Promise<LicensingStrategyResult>;
    getLicenseContent(): Promise<string>;
}

export class NoopLicensingStrategy implements LicensingStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    vm: VirtualMachine;
    storageContainerName: string;
    licenseDirectoryName: string;
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        this.vm = vm;
        this.storageContainerName = storageContainerName;
        this.licenseDirectoryName = licenseDirectoryName;
        return Promise.resolve();
    }
    apply(): Promise<LicensingStrategyResult> {
        this.proxy.logAsInfo('calling NoopLicensingStrategy.apply');
        this.proxy.logAsInfo('noop');
        this.proxy.logAsInfo('called NoopLicensingStrategy.apply');
        return Promise.resolve(LicensingStrategyResult.LicenseNotRequired);
    }
    getLicenseContent(): Promise<string> {
        return Promise.resolve('');
    }
}

export class ReusableLicensingStrategy implements LicensingStrategy {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    vm: VirtualMachine;
    storageContainerName: string;
    licenseDirectoryName: string;
    licenseFiles: LicenseFileMap;
    stockRecords: LicenseStockMap;
    usageRecords: LicenseUsageMap;
    licenseRecord: LicenseStockRecord;
    private licenseFile:Blob;
    prepare(
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter,
        vm: VirtualMachine,
        productName: string,
        storageContainerName: string,
        licenseDirectoryName: string
    ): Promise<void> {
        this.platform = platform;
        this.proxy = proxy;
        this.vm = vm;
        this.storageContainerName = storageContainerName;
        this.licenseDirectoryName = licenseDirectoryName;
        this.licenseFiles = new Map<string, LicenseFile>();
        this.stockRecords = new Map<string, LicenseStockRecord>();
        this.usageRecords = new Map<string, LicenseUsageRecord>();
        return Promise.resolve();
    }
    async apply(): Promise<LicensingStrategyResult> {
        this.proxy.logAsInfo('calling ReusableLicensingStrategy.apply');
        [this.licenseFiles, this.stockRecords, this.usageRecords] = await Promise.all([
            this.platform
                .listLicenseFiles(this.storageContainerName, this.licenseDirectoryName)
                .catch(err => {
                    this.proxy.logForError('failed to list license blob files.', err);
                }),
            this.platform.listLicenseStock().catch(err => {
                this.proxy.logForError('failed to list license stock', err);
            }),
            this.platform.listLicenseUsage().catch(err => {
                this.proxy.logForError('failed to list license stock', err);
            })
        ]);
        // update the license stock records on db if any change in file storage
        // this returns the newest stockRecords on the db
        this.stockRecords = await this.updateLicenseStockRecord(
            this.licenseFiles,
            this.stockRecords
        );

        // get an available license
        let stockRecord:LicenseStockRecord;
        try {
            this.licenseRecord = await this.getAvailableLicense();
            // load license content
            this.licenseFile = await this.platform.getBlobFromStorage(this.)
        } catch (error) {
            this.proxy.logForError('Failed to get a license.', error);
        }

        this.proxy.logAsInfo('called ReusableLicensingStrategy.apply');
    }
    updateLicenseStockRecord(licenseFiles: any, stockRecords: any): any {
        throw new Error('Method not implemented.');
    }

    protected async syncUsageRecords(): Promise<void> {}

    protected async listOutOfSyncRecord(sync?: boolean): Promise<LicenseUsageRecord[]> {
        if (sync) {
            await this.syncUsageRecords();
        }
        return Array.from(this.usageRecords.values()).filter(usageRecrod => {
            return !usageRecrod.vmInSync;
        });
    }
    protected async getAvailableLicense(): Promise<LicenseStockRecord> {
        let outOfSyncArray: LicenseUsageRecord[];
        // try to look for an unused one first
        // checksum is the unique key of a license
        const unusedArray = Array.from(this.stockRecords.keys())
            .filter(checksum => {
                return !this.usageRecords.has(checksum);
            })
            .map(this.stockRecords.get);
        // if no availalbe, check if any in-use license is associated with a vm which isn't in-sync
        if (unusedArray.length === 0) {
            outOfSyncArray = await this.listOutOfSyncRecord();
            // if every license is in use and seems to be in-sync,
            // sync the record with vm running state and heartbeat records,
            // then check it once again
            if (outOfSyncArray.length === 0) {
                outOfSyncArray = await this.listOutOfSyncRecord(true);
            }
            // run out of license
            if (outOfSyncArray.length === 0) {
                throw new Error('Run out of license.');
            } else {
                // pick the fist one and return as a reusable license
                this.proxy.logAsInfo(
                    `A reusable license (checksum: ${outOfSyncArray[0].checksum},` +
                        ` previous assigned vmId: ${outOfSyncArray[0].vmId},` +
                        ` file name: ${outOfSyncArray[0].fileName}) is found.`
                );
                return this.stockRecords.get(outOfSyncArray[0].checksum);
            }
        } else {
            // pick the first one and return as unused license
            this.proxy.logAsInfo(
                `An unused license (checksum: ${unusedArray[0].checksum}, ` +
                    `file name: ${unusedArray[0].fileName}) is found.`
            );
            return unusedArray[0];
        }
    }
    getLicenseContent(): Promise<string> {
        throw new Error('Method not implemented.');
    }
}
