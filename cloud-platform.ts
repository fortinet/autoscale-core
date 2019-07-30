'use strict'

/*
Author: Fortinet
*
* @abstract
* Class used to define the capabilities required from cloud platform.
*/

import { Blob } from './blob'
import * as CoreFunctions from './core-functions'
import { HealthCheck } from './health-check-record'
import { LicenseItem } from './license-item'
import { LicenseRecord } from './license-record'
import { LifecycleItem } from './lifecycle-item'
import { NicAttachmentRecord, NicAttachmentState } from './nic-attachment'
import { Logger } from './logger'
import * as MasterElection from './master-election'
import { SettingItem } from './setting-items/setting-item'
import { VirtualNetworkLike, SubnetLike } from './virtual-network'
import { NetworkInterfaceLike, VirtualMachine, ScalingGroupLike } from './virtual-machine'
import { URL } from 'url'
import * as HttpStatusCode from 'http-status-codes'

export { HttpStatusCode }

export const USE_EXISTING: unique symbol = Symbol('Use existing value from the data store');

export type ValidHeartbeatInterval = number | typeof USE_EXISTING;

export interface RequestInfo {
    instanceId: string
    interval: ValidHeartbeatInterval
    status: string | null
}

export interface AutoscaleRequestLike {
    //exists in header in GET configuration call
    'Fos-instance-id'?: string,
    //exists in body in heartbeat sync POST call
    instance?: string,
    //exists in body in heartbeat sync POST call
    interval?: string,
    // only exists in status message
    success?: string,
    [key: string]: any
}

/**
 * A function template that takes one certain input type and returns one certain output type.
 */
export type DataProcessor<InputType, OutputType> = (data: InputType) => OutputType

/**
 * An asynchronous function template that takes one certain input type and returns
 * one certain output type.
 */
export type AsyncDataProcessor<InputType, OutputType> = (data: InputType) => Promise<OutputType>

/**
 * A paired two subnets for a cetain purpose. For example, Traffic going into the subnet with
 * subnetId will be routed to the subnet with pairId
 */
export interface SubnetPair {
    subnetId: string
    pairId: string
}

/**
 * This kind of value must have a unique id but the id property name may vary.
 */
export interface ResourceLike {
    // define the key property of this resource. When the id property needs to be referenced,
    // program can retrieve it by this property.
    idPropertyName: string
}

/**
 * A error-data pair structure. It is designed to use with the Node.js error-first callback style
 * functions.
 */
export interface ErrorDataPairLike {
    error: any
    data: any
    [key:string]:any
}

/**
 * Runtime Agent is an agent-object class that holds the information of the platform request,
 * context, callback etc. This agent interacts with the platform runtime.
 * It's able to be easily passed from one handler to another within the same runtime.
 * It has one abstract function processResponse to handle how data is passing back to a
 * platform.
 */
export abstract class RuntimeAgent<HttpRequest, RuntimeContext> {
    response: ErrorDataPairLike
    readonly createdTime: number
    constructor(
        readonly request: HttpRequest,
        readonly context: RuntimeContext,
        readonly logger: Logger
    ) {
        this.createdTime = Date.now();
    }

    /**
     * function to respond to a platform
     */
    abstract async respond(response: ErrorDataPairLike, httpStatusCode?: number):Promise<any>;
}
/**
 * It's a typical key-value pair with 'key' and 'value' properties.
 */
export interface KeyValuePair<VALUE_TYPE> {
    key: string
    value: VALUE_TYPE
}

/**
 * filter: a filter array of KeyValueLike type to include some items
 * excluded: a filter array of KeyValueLike type to exclude some items
 * included: a filter array of KeyValueLike type to include some items
 * for the property 'kind', see the taggged union types
 * @see: https://github.com/Microsoft/TypeScript/wiki/What's-new-in-TypeScript#tagged-union-types
 */
export interface FilterLikeResourceQuery<KeyValueLike> {
    filter?: KeyValueLike[]
    excluded?: KeyValueLike[]
    included?: KeyValueLike[]
}

/**
 * Carry neccesarry information about how to describe a virtual machine instance in a platform.
 */
//TODO: need to rename it to VirtualMachineDescriptor
export interface VirtualMachineDescriptor extends ResourceLike {
    // ResourceLike definition
    idPropertyName: 'instanceId'
    // instance id of a cloud-computing device that has an OS, network interface, ip, etc.
    // e.g.: AWS EC2 Instance
    instanceId: string
    // scaling group name (or id) when it comes to auto scaling.
    // such device may be placed in an scaling group. Some other device may not need to set this.
    scalingGroupName?: string
    // refers to its primary private ip address
    privateIp?: string
    // refers to its primary public ip address if it has one
    publicIp?: string
    // defines that any other proerty should have a string key and any value type
    [key: string]: any
}

/**
 * It is a virtual network descriptor. virtual network refers to: VPC (AWS), VirtualNetwork (Azure)
 * etc.
 */
export interface VirtualNetworkDescriptor extends ResourceLike {
    idPropertyName: 'virtualNetworkId'
    virtualNetworkId: string
    subnetId?: string[]
}

/**
 * NetworkInterfaceDescriptor holds only information necessary to describe a network interface
 * in a platform.
 */
export interface NetworkInterfaceDescriptor extends ResourceLike {
    idPropertyName: 'networkInterfaceId'
    networkInterfaceId: string
    subnetId?: string
}

export interface ScalingGroupDecriptor extends ResourceLike {
    idPropertyName: 'scalingGroupName' | 'scalingGroupId',
    scalingGroupName?: string,
    scalingGroupId?: string
}

// TODO:
// NOTE: keep this commented lines until refactoring is done.
// export interface SettingItem {
//     settingKey: string,
//     settingValue: string | {},
//     editable: boolean,
//     jsonEncoded: boolean,
//     description: string
// }


export type SettingItems = { [k: string]: SettingItem }

/**
 * BlobStorageItemDescriptor holds only information necessary to describe a blob in a storage
 * in a platform.
 * It includes the blob location and file name
 */
export interface BlobStorageItemDescriptor {
    storageName: string
    keyPrefix: string
    fileName?: string
}

/**
 * BlobStorageItemDescriptor holds only information necessary to describe a blob in a storage
 * in a platform.
 * It includes the blob location and 3 optional file name filters: filter, included, excluded.
 */
export interface BlobStorageItemQuery extends FilterLikeResourceQuery<string> {
    storageName: string
    keyPrefix: string
}

/**
 * Defines the Http request-object-like structure
 */
export interface HttpRequestLike {
    headers: {
        [key: string]: any
    }
    body?: {
        [key: string]: any
    }
    [key: string]: any
}

export interface HttpRequest extends HttpRequestLike {
    // note that different platform may provide the http method property in different names
    // here the httpMethod should return the method per platform
    httpMethod: HttpMethodType
}

/**
 * Http methods are defined as all capticalized letters.
 */
export type HttpMethodType = 'POST' | 'GET' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * Class used to define the capabilities required from cloud platform.
 * P_NIQ: parameter to query NetworkInterface
 */
/**
 * Class used to define the capabilities required from cloud platform.
 *
 * Note: Each abstract function interacting with the platform api should catch potential errors
 * thrown from the platform api, output the error message with the Runtim Agent logger. Whether
 * to throw it to upper level of the calling stack or not depends on how this abstract function
 * is required for implementation.
 *
 * @argument HttpRequest: generic type parameter used by RA
 * @argument RuntimeContext: generic type parameter used by RA
 * @argument KeyValueLike: a KeyValueLike parameter kind generic type
 * @argument VmSourceType: generic type parameter used by VM
 * @argument VM: a concrete VirtualMachine kind parameter for a specific platform
 * @argument RA: a concrete RuntimeAgent kind parameter for a specific platform
 */
export abstract class CloudPlatform<
    HttpRequest,
    RuntimeContext,
    KeyValueLike,
    VmSourceType,
    VM extends VirtualMachine<VmSourceType, NetworkInterfaceLike>,
    RA extends RuntimeAgent<HttpRequest, RuntimeContext>
> {
    // TODO: NOTE:ugly naming here. should remove the underscore
    // to use accessor style here, have to make it double underscore.
    // will remove it while improving the way to use setting
    protected __settings: SettingItems | null
    protected _initialized: boolean
    protected _masterRecord: MasterElection.MasterRecord
    masterScalingGroupName: string
    constructor(public runtimeAgent: RA) {
        this.__settings = null
        this._initialized = false
    }

    get _settings(): SettingItems {
        return this.__settings
    }

    /**
     * return the instance of the platform-specific logger class
     */
    abstract get logger(): Logger

    /**
     * initialization flag. probably check it to avoid multiple init calls in a workflow?
     * @returns {Boolean} whether the CloudPlatform is initialzied or not
     */
    get initialized() {
        return this._initialized
    }

    /**
     * Initialize (and wait for) any required resources such as database tables etc.
     * Abstract class method.
     */
    abstract async init(): Promise<boolean>

    /**
     * Send response to platform.
     * @param response
     * @param httpStatusCode
     */
    abstract async respond(response: ErrorDataPairLike, httpStatusCode?: number):Promise<void>;

    /**
     * Submit an master record for election with a vote state.
     * Abstract class method.
     * @param candidateInstance the master candidate instance
     * @param voteState vote state of 'pending' or 'done'
     * @param method 'new' for inserting when no record exists, 'replace' for replacing
     * the existing record or the same as 'new', otherwise.
     */
    abstract async putMasterRecord(
        candidateInstance: VM,
        voteState: MasterElection.VoteState,
        method: MasterElection.VoteMethod
    ): Promise<boolean>
    /**
     * Get the master record from db.
     * Abstract class method.
     */
    abstract async getMasterRecord(): Promise<MasterElection.MasterRecord>

    /**
     * Remove the current master record from db.
     * Abstract class method.
     */
    abstract async removeMasterRecord(): Promise<void>
    /**
     * Get all existing lifecyle actions for a FortiGate instance from the database.
     * Abstract class method.
     * @param instanceId Instance ID of a FortiGate.
     */
    abstract async getLifecycleItems(instanceId: string): Promise<LifecycleItem[]>
    /**
     * Update one life cycle action item hooked with an instance.
     * Abstract class method.
     * @param item Item used by the platform to complete
     *  a lifecycleAction.
     */
    // TODO: what should be return?
    abstract async updateLifecycleItem(item: LifecycleItem): Promise<boolean>
    /**
     * remove one life cycle action item hooked with an instance.
     * Abstract class method.
     * @param {LifecycleItem} item Item used by the platform to complete
     *  a lifecycleAction.
     */
    abstract async removeLifecycleItem(item: LifecycleItem): Promise<boolean>
    /**
     * Clean up database the current LifeCycleItem entries (or any expired entries).
     * Abstract class method.
     * @param items an array of LifeCycleItem to remove from database.
     * When provided, only the list of items will be cleaned up, otherwise scan for expired
     *  items to purge.
     */
    abstract async cleanUpDbLifeCycleActions(
        items: LifecycleItem[] | null
    ): Promise<LifecycleItem[] | boolean>
    /**
     * Get the url for the callback-url portion of the config.
     * @param processor a data processor function that returns the url string
     */
    abstract async getCallbackEndpointUrl(processor?: DataProcessor<RA, URL>): Promise<URL>

    /**
     * Extract useful info from request event.
     * @param runtimeAgent the runtime agent that contains the request
     * @returns an object of required info per platform.
     */
    // TODO: refactor this function
    abstract extractRequestInfo(runtimeAgent: RA): RequestInfo

    /**
     * Describe an instance and retrieve its information, with given parameters.
     * Abstract class method.
     * @param descriptor a descriptor for describing an instance.
     */
    abstract async describeInstance(descriptor: VirtualMachineDescriptor): Promise<VM>

    /**
     * do the instance health check.
     * Abstract class method.
     * @param Descriptor the instance Descriptor
     * @param heartBeatInterval the expected interval (second) between heartbeats
     */
    abstract async getInstanceHealthCheck(
        descriptor: VirtualMachineDescriptor,
        heartBeatInterval?: ValidHeartbeatInterval
    ): Promise<HealthCheck | null>

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
        heartBeatInterval: ValidHeartbeatInterval,
        masterIp: string,
        checkPointTime: number,
        forceOutOfSync?: boolean,
        scalingGroupName?: string
    ): Promise<boolean>

    /**
     * delete the instance health check monitoring record from DB.
     * Abstract class method.
     * @param instanceId the instanceId of instance
     * @param scalingGroupName the scaling group the isntance is located
     */
    abstract async deleteInstanceHealthCheck(instanceId: string, scalingGroupName?:string): Promise<boolean>

    /**
     * Delete one or more instances from the auto scaling group.
     * Abstract class method.
     * @param {Object} parameters parameters necessary for instance deletion.
     */
    //FIXME: parameters -> descriptors
    abstract async deleteInstances(parameters: VirtualMachineDescriptor[]): Promise<boolean>

    /**
     * describe a scaling group
     * @param decriptor a descriptor for describing a scaling group.
     */
    //FIXME: decriptor -> descriptor, it's spelt wrong in multiple places
    abstract async describeScalingGroup(decriptor: ScalingGroupDecriptor): Promise<ScalingGroupLike | null>

    /**
     * Create a network interface in the platform
     * @param parameters
     */
    //FIXME: parameters -> descriptor
    abstract async createNetworkInterface(
        parameters: NetworkInterfaceDescriptor
    ): Promise<NetworkInterfaceLike | boolean>

    /**
     * Delete a network interface in the platform
     * @param parameters
     */
    //FIXME: parameters -> descriptor
    abstract async deleteNetworkInterface(parameters: NetworkInterfaceDescriptor): Promise<boolean>

    /**
     * query a network interface in the platform
     * @param parameters
     */
    //FIXME: parameters -> descriptor
    abstract async describeNetworkInterface(
        parameters: NetworkInterfaceDescriptor
    ): Promise<NetworkInterfaceLike> | null

    /**
     * query a or multiple network interfaces in a platform
     * @param parameters
     * @param statusToInclude a list of platform-specific status strings
     */
    //FIXME: parameters -> resourceQuery
    abstract async listNetworkInterfaces(
        parameters: FilterLikeResourceQuery<KeyValueLike>,
        statusToInclude?: string[]
    ): Promise<NetworkInterfaceLike[]>

    /**
     * Attach one network interface to a virtual machine.
     * @param instance
     * @param nic
     * @return it's recommended to return the index of the nic in the vm
     */
    abstract async attachNetworkInterface(
        instance: VM,
        nic: NetworkInterfaceLike
    ): Promise<string | boolean>

    /**
     * Detach one network interface to a virtual machine.
     * @param instance
     * @param nic
     */
    abstract async detachNetworkInterface(instance: VM, nic: NetworkInterfaceLike): Promise<boolean>

    /**
     * Insert / update the network interface record managed by the Autoscale project
     * @param instanceId
     * @param nicId
     * @param state
     * @param conditionState
     */
    abstract async updateNicAttachmentRecord(
        instanceId: string,
        nicId: string,
        state: NicAttachmentState,
        conditionState?: NicAttachmentState
    ): Promise<boolean>

    /**
     * List all network interface records managed by the Autoscale project
     */
    abstract async listNicAttachmentRecord(): Promise<NicAttachmentRecord[]>

    /**
     * query the network interface record attached to the given instance. currently can only
     * be able to manage one additional nic per vm via the Autoscale project
     * @param instanceId
     */
    abstract async getNicAttachmentRecord(instanceId: string): Promise<NicAttachmentRecord | null>

    /**
     * delete the Autoscale managed network interface record attached to the given instance.
     * currently can only be able to manage one additional nic per vm via the Autoscale project.
     * @param instanceId
     * @param conditionState
     */
    abstract async deleteNicAttachmentRecord(
        instanceId: string,
        conditionState?: NicAttachmentState
    ): Promise<boolean>

    /**
     * get one saved setting of the current Autoscale deployment from DB
     * @param key setting key
     * @param valueOnly whether retrieve the stringified value of the raw value
     */
    // TODO: need to refactor
    async getSettingItem(key: string, valueOnly?: boolean): Promise<string | {}> {
        // check _setting first
        if (this._settings && this._settings.hasOwnProperty(key)) {
            // if get full item object
            if (
                !valueOnly &&
                typeof this._settings[key] === 'object' && // TODO: need to refactor the way
                // of type checking
                this._settings[key].settingKey
            ) {
                return this._settings[key]
            }
            // if not get full item object
            // _settings is not an object of item objects
            if (valueOnly && this._settings[key]) {
                return this._settings[key].settingKey || this._settings[key]
            }
        }
        await this.getSettingItems([key], valueOnly)
        return this._settings[key]
    }

    /**
     * get multiple saved settings from DB
     * @param {Array} keyFilter An array of setting key to filter (return)
     * @param {Boolean} valueOnly return setting value only or full detail
     * @returns {Object} Json object
     */
    abstract async getSettingItems(keyFilter?: string[], valueOnly?: boolean): Promise<SettingItems>

    /**
     * save one setting of the current Autoscale deployment to DB
     * @param key setting key
     * @param value raw value of he setting in string or object form
     * @param description escription for this setting. recommend to prvoide this even
        // though it is optional.
     * @param jsonEncoded whether the raw value of this item is JSON.stringif()-ed or not.
     * @param editable indicator whether this setting allow for modification
        or not after the Autoscale is deployed.
     */
    abstract async setSettingItem(
        key: string,
        value: string | {}, //TODO: could it be a JSON form?
        description?: string,
        jsonEncoded?: boolean,
        editable?: boolean
    ): Promise<boolean>

    /**
     * get the blob from storage
     * @param descriptor descriptor for this blob
     * @returns the object must have the property 'content' containing the blob content
     */
    abstract async getBlobFromStorage(descriptor: BlobStorageItemDescriptor): Promise<Blob>

    /**
     * query blob items in the storage
     * @param parameters a filter-like resource query
     */
    //FIXME: parameters -> resourceQuery
    abstract async listBlobFromStorage(parameters: BlobStorageItemQuery): Promise<Blob[]>

    /**
     * retrieve the blob content in string format
     * @param descriptor
     */
    abstract async getLicenseFileContent(descriptor: BlobStorageItemDescriptor): Promise<string>

    /**
     * List license files in storage
     * @param {Object} parameters parameter require to list and filter licenses
     * @returns {Map<LicenseItem>} must return a Map of LicenseItem with blobKey as key,
     * and LicenseItem as value
     */
    //FIXME: parameters -> descriptor
    abstract async listLicenseFiles(
        parameters?: BlobStorageItemDescriptor
    ): Promise<Map<string, LicenseItem>>

    /**
     * Update a license record to the DB
     * @param licenseRecord
     * @param replace replace existing one or put new one
     */
    abstract async updateLicenseUsage(
        licenseRecord: LicenseRecord,
        replace?: boolean
    ): Promise<boolean>
    /**
     * List license usage records including records for used licenses and only
     * @returns {Map<licenseRecord>} must return a Map of licenseRecord with checksum as key,
     * and LicenseItem as value
     */
    abstract async listLicenseUsage(): Promise<Map<string, LicenseRecord>>

    /**
     * List license usage records including records for non-used and used licenses
     *  @returns {Map<licenseRecord>} must return a Map of LicenseItem with blochecksumbKey as key,
     * and LicenseItem as value
     */
    abstract async listLicenseStock(): Promise<Map<string, LicenseRecord>>

    /**
     * Update the given license item to db
     * @param {LicenseItem} licenseItem the license item to update
     * @param {Boolean} replace update method: replace existing or not. Default true
     */
    abstract async updateLicenseStock(licenseItem: LicenseItem, replace?: boolean): Promise<boolean>

    /**
     * Delete the given license item from db
     * @param {LicenseItem} licenseItem the license item to update
     */
    abstract async deleteLicenseStock(licenseItem: LicenseItem): Promise<boolean>

    /**
     * issue a virtual machine termination request to the auto scaling group in a platform
     * @param instance
     */
    abstract async terminateInstanceInAutoScalingGroup(instance: VM): Promise<boolean>

    /**
     * Retrieve the cached vm info from DB
     * @param {String} scaleSetName scaling group name the vm belongs to
     * @param {String} instanceId the instanceId of the vm if instanceId is the unique ID
     * @param {String} vmId another unique ID to identify the vm if instanceId is not the unique ID
     */
    abstract async getVmInfoCache(
        scaleSetName: string,
        instanceId: string,
        vmId?: string
    ): Promise<{} | null>

    /**
     * save the vm info object to the DB.
     * Caching it to avoid frequent api call to a platform that has a limit per period (e.g.: Azure)
     * @param {String} scaleSetName scaling group name the vm belongs to
     * @param {Object} info the json object of the info to cache in database
     * @param {Integer} cacheTime the maximum time in seconds to keep the cache in database
     */
    abstract async setVmInfoCache(scaleSetName: string, info: {}, cacheTime?: number): Promise<void>
    /**
     * get the execution time lapse in millisecond.
     * Intend to be the time lapse since the very beginning the serverless function is called
     */
    getExecutionTimeLapse(): number {
        return CoreFunctions.getTimeLapse()
    }

    /**
     * get the execution time remaining in millisecond. Some platforms such as AWS provide a
     * way to calculate the remaining time to serverless function timeout.
     */
    abstract getExecutionTimeRemaining(): number

    /**
     * To finalize a master role in the master-slave HA context.
     * The master is firstly elected as a pending master. The pending master needs to proactively
     * contact the Autoscale to confirm its availability, functionality as the master role.
     * If election timeout, this pending master will be purged and a new pending master will be
     * elected.
     */
    abstract async finalizeMasterElection(): Promise<boolean>

    /**
     * Get information about a Virtual Network (terminology varies in different platform) by
     * the given parameters. For example: VPC in AWS.
     * @param parameters parameters
     */
    //FIXME: parameters -> descriptor
    abstract async describeVirtualNetwork(
        parameters: VirtualNetworkDescriptor
    ): Promise<VirtualNetworkLike>

    /**
     * Get information about the subnets in a given virtual network.
     * @param parameters parameters
     */
    //FIXME: parameters -> descriptor
    abstract async listSubnets(parameters: VirtualNetworkDescriptor): Promise<SubnetLike[]>
}
