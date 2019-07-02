'use strict';

/*
Author: Fortinet
*
* A license record class.
*/
export class LicenseRecord {
    private _instanceId: string;
    private _scalingGroupName: string;
    private _assignedTime: number;
    constructor(readonly checksum: string, readonly algorithm: string, readonly fileName: string, readonly blobKey:string,
            instanceId?:string, scalingGroupName?:string, assignedTime?:Date) {
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

    get assignedTime() {
        return this._assignedTime;
    }

    set assignedTime(time) {
        let date = time && new Date(time);
        if (date && !isNaN(date.getTime())) {
            this._assignedTime = date.getTime();
        } else {
            this._assignedTime = null;
        }
    }

    get inUse() {
        return this._instanceId !== null;
    }

    updateUsage(instanceId: string, scalingGroupName: string, assignTime: Date = new Date()) {
        this._instanceId = instanceId;
        this._scalingGroupName = instanceId && scalingGroupName || null;
        this.assignedTime = instanceId && (assignTime && assignTime.getTime() || Date.now());
    }

    // TODO: need to improve
    static fromDb(data:any) {
        if (data && data.checksum && data.algorithm && data.fileName && data.blobKey) {
            let date = new Date(data.assignTime);
            if(!date.getTime()) {
                throw new Error(`Cannot convert assign time to type Date `+
                `from value: ${data.assignTime}`);
            }
            return new LicenseRecord(data.checksum, data.algorithm,
                data.fileName, data.blobKey,
                data.instanceId, data.scalingGroupName, date);
        } else {
            return null;
        }
    }
};
