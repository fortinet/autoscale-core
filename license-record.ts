/*
Author: Fortinet
*
* A license record class.
*/

export interface LicenseRecordLike {
    checksum: string;
    algorithm: string;
    fileName: string;
    blobKey: string;
    instanceId?: string;
    scalingGroupName?: string;
    assignedTime?: number;
}
export class LicenseRecord implements LicenseRecordLike {
    private _instanceId: string;
    private _scalingGroupName: string;
    private _assignedTime: Date;
    constructor(
        readonly checksum: string,
        readonly algorithm: string,
        readonly fileName: string,
        readonly blobKey: string,
        instanceId?: string,
        scalingGroupName?: string,
        assignedTime?: Date
    ) {
        this.updateUsage(instanceId, scalingGroupName, assignedTime);
    }
    get id() {
        return this.checksum;
    }

    get instanceId() {
        return this._instanceId;
    }

    get scalingGroupName() {
        return this._scalingGroupName;
    }

    get assignedTime(): number {
        return (this._assignedTime && this._assignedTime.getTime()) || 0;
    }

    set assignedTime(time: number) {
        const date = time && new Date(time);
        if (date && !isNaN(date.getTime())) {
            this._assignedTime = date;
        } else {
            this._assignedTime = null;
        }
    }

    get inUse() {
        return this._instanceId !== null;
    }

    updateUsage(instanceId: string, scalingGroupName: string, assignTime: Date = new Date()) {
        this._instanceId = instanceId;
        this._scalingGroupName = (instanceId && scalingGroupName) || null;
        this.assignedTime = instanceId && ((assignTime && assignTime.getTime()) || Date.now());
    }
}

export function LicenseRecordConvertor(datasource: LicenseRecordLike): LicenseRecord {
    return new LicenseRecord(
        datasource.checksum,
        datasource.algorithm,
        datasource.fileName,
        datasource.blobKey,
        datasource.instanceId,
        datasource.scalingGroupName,
        new Date(datasource.assignedTime)
    );
}
