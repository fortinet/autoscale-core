'use strict';

/*
Author: Fortinet
*
* @abstract
* Class used to define the capabilities required from cloud platform.
*/

import { Blob } from './blob';
import * as CoreFunctions from './core-functions';
import { HealthCheck } from './health-check-record';
import { LicenseItem } from './license-item';
import { LicenseRecord } from './license-record';
import { LifecycleItem } from './lifecycle-item';
import { Logger } from './logger';
import * as MasterElection from './master-election';
import { SettingItem } from './setting-items/setting-item';
import { VirtualNetworkLike, SubnetLike } from './virtual-network';
import { NetworkInterfaceLike, VirtualMachine } from './virtual-machine';
import { URL } from 'url';

export interface RequestInfo {
    instanceId: string;
    interval: number;
    status: string;
}

export type DataProcessor<InputType, OutputType> = (data: InputType) => OutputType;

export type AsyncDataProcessor<InputType, OutputType> = (data: InputType) => Promise<OutputType>;

export interface SubnetPair {
    subnetId: string;
    pairId: string;
}

//This kind of value must have a unique id but the id property name may vary.
export interface ResourceLike {
    idPropertyName: string; // define the key property of this resource
}

/**
 * Discriminated Unions for descriptor
 * @see https://www.typescriptlang.org/docs/handbook/advanced-types.html
 */
export type Descriptor = InstanceDescriptor | NetworkInterfaceDescriptor;

export interface RuntimeAgent<HttpRequest, RuntimeContext> {
    request: HttpRequest;
    context: RuntimeContext;
    logger: Logger;
    processResponse: (response: any) => Promise<void>;
}

/**
 * This interface defines the base of interfaces that they have a kind property
 * to distinguish themselves by their kind.
 * Usually, it's helpful when it comes to the Discriminated Unions pattern.
 */
export interface Akind {
    kind: string;
}

export interface KeyValuePair<VALUE_TYPE> extends Akind {
    kind: 'KeyValuePair';
    key: string;
    value: VALUE_TYPE;
}

/**
 * filter: a filter array of KeyValueLike type to include some items
 * excluded: a filter array of KeyValueLike type to exclude some items
 * included: a filter array of KeyValueLike type to include some items
 * for the property 'kind', see the taggged union types
 * @see: https://github.com/Microsoft/TypeScript/wiki/What's-new-in-TypeScript#tagged-union-types
 */
export interface FilterLikeResourceQuery<KeyValueLike> extends Akind {
    filter?: KeyValueLike[];
    excluded?: KeyValueLike[];
    included?: KeyValueLike[];
}

export interface InstanceDescriptor extends Akind, ResourceLike {
    kind: 'InstanceDescriptor';
    idPropertyName: 'instanceId';
    instanceId: string;
    scalingGroupName?: string;
    privateIp?: string;
    publicIp?: string;
}

export interface VirtualNetworkDescriptor extends Akind, ResourceLike {
    kind: 'VirtualNetworkDescriptor';
    idPropertyName: 'virtualNetworkId';
    virtualNetworkId: string;
    subnetId?: string[];
}

/**
 * NetworkInterfaceDescriptor holds only information necessary to describe a network interface
 * in a platform.
 */
export interface NetworkInterfaceDescriptor extends Akind, ResourceLike {
    networkInterfaceId: string;
    subnetId?: string;
}

export enum NicAttachmentState {
    attached = 'attached',
    pending_attach = 'pending_attach',
    detached = 'detached',
    pending_detach = 'pending_detach',
}

export interface NicAttachmentRecord {}

// NOTE: keep this commented lines until refactoring is done.
// export interface SettingItem {
//     settingKey: string,
//     settingValue: string | {},
//     editable: boolean,
//     jsonEncoded: boolean,
//     description: string
// }

export type SettingItems = { [k: string]: SettingItem };

export interface BlobStorageItemDescriptor {
    storageName: string;
    keyPrefix: string;
    fileName?: string;
}

export interface HttpRequestLike {
    headers: {
        [key: string]: string;
    };
    body: {
        [key: string]: string;
    };
    httpMethod?: HttpMethodType;
    method?: HttpMethodType;
}

export type HttpMethodType = 'POST' | 'GET' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | string;

/**
 * Class used to define the capabilities required from cloud platform.
 * P_NIQ: parameter to query NetworkInterface
 */
export abstract class CloudPlatform<HttpRequest, RuntimeContext, KeyValueLike, VmSourceType> {
    // TODO: NOTE:ugly naming here. should remove the underscore
    // to use accessor style here, have to make it double underscore.
    // will remove it while improving the way to use setting
    protected __settings: SettingItems | null;
    protected _initialized: boolean;
    protected _masterRecord: MasterElection.MasterRecord;
    masterScalingGroupName: string;
    constructor(public runtimeAgent: RuntimeAgent<HttpRequest, RuntimeContext>) {
        this.__settings = null;
        this._initialized = false;
    }

    get _settings(): SettingItems {
        return this.__settings;
    }

    /**
     * return the instance of the platform-specific logger class
     */
    abstract get logger(): Logger;

    /**
     * @returns {Boolean} whether the CloudPlatform is initialzied or not
     */
    get initialized() {
        return this._initialized;
    }
    /* eslint-disable no-unused-vars */
    /**
     * Initialize (and wait for) any required resources such as database tables etc.
     * Abstract class method.
     */
    abstract async init(): Promise<boolean>;

    /**
     * Submit an master record for election with a vote state.
     * Abstract class method.
     * @param candidateInstance the master candidate instance
     * @param voteState vote state of 'pending' or 'done'
     * @param method 'new' for inserting when no record exists, 'replace' for replacing
     * the existing record or the same as 'new', otherwise.
     */
    abstract async putMasterRecord(
        candidateInstance: VirtualMachine<VmSourceType, NetworkInterfaceLike>,
        voteState: MasterElection.VoteState,
        method: MasterElection.VoteMethod
    ): Promise<boolean>;
    /**
     * Get the master record from db.
     * Abstract class method.
     */
    abstract async getMasterRecord(): Promise<MasterElection.MasterRecord>;

    /**
     * Remove the current master record from db.
     * Abstract class method.
     */
    abstract async removeMasterRecord(): Promise<void>;
    /**
     * Get all existing lifecyle actions for a FortiGate instance from the database.
     * Abstract class method.
     * @param instanceId Instance ID of a FortiGate.
     */
    abstract async getLifecycleItems(instanceId: string): Promise<LifecycleItem[]>;
    /**
     * Update one life cycle action item hooked with an instance.
     * Abstract class method.
     * @param item Item used by the platform to complete
     *  a lifecycleAction.
     */
    // TODO: what should be return?
    abstract async updateLifecycleItem(item: LifecycleItem): Promise<unknown>;
    /**
     * remove one life cycle action item hooked with an instance.
     * Abstract class method.
     * @param {LifecycleItem} item Item used by the platform to complete
     *  a lifecycleAction.
     */
    abstract async removeLifecycleItem(item: LifecycleItem): Promise<boolean>;
    /**
     * Clean up database the current LifeCycleItem entries (or any expired entries).
     * Abstract class method.
     * @param items an array of LifeCycleItem to remove from database.
     * When provided, only the list of items will be cleaned up, otherwise scan for expired
     *  items to purge.
     */
    abstract async cleanUpDbLifeCycleActions(
        items: LifecycleItem[] | null
    ): Promise<LifecycleItem[] | boolean>;
    /**
     * Get the url for the callback-url portion of the config.
     * @param processor a data processor function that returns the url string
     */
    abstract async getCallbackEndpointUrl(
        processor?: DataProcessor<RuntimeAgent<HttpRequest, RuntimeContext>, string>
    ): Promise<URL>;

    /**
     * Extract useful info from request event.
     * @param {Object} request the request event
     * @returns {Object} an object of required info per platform.
     */
    // TODO: refactor this function
    abstract extractRequestInfo(request: any): RequestInfo;

    /**
     * Describe an instance and retrieve its information, with given parameters.
     * Abstract class method.
     * @param Descriptor a Descriptor for describing an instance.
     */
    abstract async describeInstance(
        Descriptor: InstanceDescriptor
    ): Promise<VirtualMachine<VmSourceType, NetworkInterfaceLike>>;

    /**
     * do the instance health check.
     * Abstract class method.
     * @param instance the instance
     * @param heartBeatInterval the expected interval (second) between heartbeats
     */
    abstract async getInstanceHealthCheck(
        instance: VirtualMachine<VmSourceType, NetworkInterfaceLike>,
        heartBeatInterval?: number
    ): Promise<HealthCheck>;
    /**
     * do the instance health check.
     * Abstract class method.
     * @param Descriptor the instance Descriptor
     * @param heartBeatInterval the expected interval (second) between heartbeats
     */
    abstract async getInstanceHealthCheck(
        Descriptor: InstanceDescriptor,
        heartBeatInterval?: number
    ): Promise<HealthCheck>;

    /**
     * update the instance health check result to DB.
     * Abstract class method.
     * @param healthCheckObject update based on the healthCheckObject got by return from
     * getInstanceHealthCheck
     * @param heartBeatInterval the expected interval (second) between heartbeats
     * @param masterIp the current master ip in autoscaling group
     * @param checkPointTime the check point time of when the health check is performed.
     * @param forceOutOfSync whether force to update this record as 'out-of-sync'
     * @returns {bool} resul: true or false
     */
    abstract async updateInstanceHealthCheck(
        healthCheck: HealthCheck,
        heartBeatInterval: number,
        masterIp: string,
        checkPointTime: number,
        forceOutOfSync?: boolean
    ): Promise<boolean>;

    /**
     * delete the instance health check monitoring record from DB.
     * Abstract class method.
     * @param instanceId the instanceId of instance
     */
    abstract async deleteInstanceHealthCheck(instanceId: string): Promise<boolean>;

    /**
     * Delete one or more instances from the auto scaling group.
     * Abstract class method.
     * @param {Object} parameters parameters necessary for instance deletion.
     */
    abstract async deleteInstances(parameters: InstanceDescriptor[]): Promise<boolean>;

    abstract async createNetworkInterface(
        parameters: NetworkInterfaceDescriptor
    ): Promise<NetworkInterfaceLike | boolean>;

    abstract async deleteNetworkInterface(parameters: NetworkInterfaceDescriptor): Promise<boolean>;

    abstract async describeNetworkInterface(
        parameters: NetworkInterfaceDescriptor
    ): Promise<NetworkInterfaceLike> | null;

    abstract async listNetworkInterfaces(
        parameters: FilterLikeResourceQuery<KeyValueLike>,
        statusToInclude?: string[]
    ): Promise<NetworkInterfaceLike[]>;

    abstract async attachNetworkInterface(
        instance: VirtualMachine<VmSourceType, NetworkInterfaceLike>,
        nic: NetworkInterfaceLike
    ): Promise<string | boolean>;

    abstract async detachNetworkInterface(
        instance: VirtualMachine<VmSourceType, NetworkInterfaceLike>,
        nic: NetworkInterfaceLike
    ): Promise<boolean>;

    abstract async listNicAttachmentRecord(): Promise<NicAttachmentRecord[]>;

    abstract async getNicAttachmentRecord(instanceId: string): Promise<NicAttachmentRecord>;

    abstract async updateNicAttachmentRecord(
        instanceId: string,
        nicId: string,
        state: NicAttachmentState,
        conditionState?: NicAttachmentState
    ): Promise<boolean>;

    abstract async deleteNicAttachmentRecord(
        instanceId: string,
        conditionState?: NicAttachmentState
    ): Promise<boolean>;

    async getSettingItem(key: string, valueOnly?: boolean): Promise<string | {}> {
        // check _setting first
        if (this._settings && this._settings.hasOwnProperty(key)) {
            // if get full item object
            if (
                !valueOnly &&
                typeof this._settings[key] === 'object' &&
                this._settings[key].settingKey
            ) {
                return this._settings[key];
            }
            // if not get full item object
            // _settings is not an object of item objects
            if (valueOnly && this._settings[key]) {
                return this._settings[key].settingKey || this._settings[key];
            }
        }
        await this.getSettingItems([key], valueOnly);
        return this._settings[key];
    }

    /**
     * get multiple saved settings from DB
     * @param {Array} keyFilter An array of setting key to filter (return)
     * @param {Boolean} valueOnly return setting value only or full detail
     * @returns {Object} Json object
     */
    abstract async getSettingItems(
        keyFilter?: string[],
        valueOnly?: boolean
    ): Promise<SettingItems>;

    abstract async setSettingItem(
        key: string,
        value: string | {},
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<boolean>;

    /**
     * get the blob from storage
     * @param {Object} parameters parameter object
     * @returns {Object} the object must have the property 'content' containing the blob content
     */
    abstract async getBlobFromStorage(parameters: BlobStorageItemDescriptor): Promise<Blob>;

    // TODO: what shuold be the correct return type here?
    abstract async listBlobFromStorage(parameters: BlobStorageItemDescriptor): Promise<Blob[]>;

    abstract async getLicenseFileContent(fileName: string): Promise<string>;

    /**
     * List license files in storage
     * @param {Object} parameters parameter require to list and filter licenses
     * @returns {Map<LicenseItem>} must return a Map of LicenseItem with blobKey as key,
     * and LicenseItem as value
     */
    abstract async listLicenseFiles(
        parameters?: BlobStorageItemDescriptor
    ): Promise<Map<string, LicenseItem>>;

    abstract async updateLicenseUsage(
        licenseRecord: LicenseRecord,
        replace?: boolean
    ): Promise<boolean>;
    /**
     * List license usage records
     * @returns {Map<licenseRecord>} must return a Map of licenseRecord with checksum as key,
     * and LicenseItem as value
     */
    abstract async listLicenseUsage(): Promise<Map<string, LicenseRecord>>;

    /**
     *  @returns {Map<licenseRecord>} must return a Map of LicenseItem with blochecksumbKey as key,
     * and LicenseItem as value
     */
    abstract async listLicenseStock(): Promise<Map<string, LicenseRecord>>;

    /**
     * Update the given license item to db
     * @param {LicenseItem} licenseItem the license item to update
     * @param {Boolean} replace update method: replace existing or not. Default true
     */
    abstract async updateLicenseStock(
        licenseItem: LicenseItem,
        replace?: boolean
    ): Promise<boolean>;

    /**
     * Delete the given license item from db
     * @param {LicenseItem} licenseItem the license item to update
     */
    abstract async deleteLicenseStock(licenseItem: LicenseItem): Promise<boolean>;

    abstract async terminateInstanceInAutoScalingGroup(
        instance: VirtualMachine<VmSourceType, NetworkInterfaceLike>
    ): Promise<boolean>;

    /**
     * Retrieve the cached vm info from database
     * @param {String} scaleSetName scaling group name the vm belongs to
     * @param {String} instanceId the instanceId of the vm if instanceId is the unique ID
     * @param {String} vmId another unique ID to identify the vm if instanceId is not the unique ID
     */
    abstract async getVmInfoCache(
        scaleSetName: string,
        instanceId: string,
        vmId?: string
    ): Promise<{} | null>;

    /**
     *
     * @param {String} scaleSetName scaling group name the vm belongs to
     * @param {Object} info the json object of the info to cache in database
     * @param {Integer} cacheTime the maximum time in seconds to keep the cache in database
     */
    abstract async setVmInfoCache(
        scaleSetName: string,
        info: {},
        cacheTime?: number
    ): Promise<void>;
    /**
     * get the execution time lapse in millisecond
     */
    getExecutionTimeLapse(): number {
        return CoreFunctions.getTimeLapse();
    }

    /**
     * get the execution time remaining in millisecond
     */
    abstract getExecutionTimeRemaining(): number;

    abstract async finalizeMasterElection(): Promise<boolean>;

    /* eslint-disable max-len */
    /**
     * Get information about a Virtual Network (terminology varies in different platform) by the given parameters.
     * @param parameters parameters
     */
    /* eslint-enable max-len */
    abstract async describeVirtualNetwork(
        parameters: VirtualNetworkDescriptor
    ): Promise<VirtualNetworkLike>;

    /* eslint-disable max-len */
    /**
     * Get information about a VPC by the given parameters.
     * @param parameters parameters
     */
    /* eslint-enable max-len */
    abstract async listSubnets(parameters: VirtualNetworkDescriptor): Promise<SubnetLike[]>;
    /* eslint-enable no-unused-vars */
}
