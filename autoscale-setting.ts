import { JSONable } from './jsonable';

/**
 * Enumerated value of SettingItem keys
 *
 * @export
 * @enum {number}
 */
export enum AutoscaleSetting {
    AdditionalConfigSetNameList = 'additional-configset-name-list',
    AutoscaleHandlerUrl = 'autoscale-handler-url',
    AssetStorageContainer = 'asset-storage-name',
    AssetStorageDirectory = 'asset-storage-key-prefix',
    ByolScalingGroupName = 'byol-scaling-group-name',
    ByolScalingGroupDesiredCapacity = 'byol-scaling-group-desired-capacity',
    ByolScalingGroupMinSize = 'byol-scaling-group-min-size',
    ByolScalingGroupMaxSize = 'byol-scaling-group-max-size',
    CustomAssetContainer = 'custom-asset-container',
    CustomAssetDirectory = 'custom-asset-directory',
    EnableNic2 = 'enable-second-nic',
    EnableHybridLicensing = 'enable-hybrid-licensing',
    EnableInternalElb = 'enable-internal-elb',
    EnableVmInfoCache = 'enable-vm-info-cache',
    HeartbeatDelayAllowance = 'heartbeat-delay-allowance',
    HeartbeatInterval = 'heartbeat-interval',
    HeartbeatLossCount = 'heartbeat-loss-count',
    LicenseFileDirectory = 'license-file-directory',
    MasterElectionTimeout = 'master-election-timeout',
    MasterScalingGroupName = 'master-scaling-group-name',
    PaygScalingGroupName = 'payg-scaling-group-name',
    PaygScalingGroupDesiredCapacity = 'scaling-group-desired-capacity',
    PaygScalingGroupMinSize = 'scaling-group-min-size',
    PaygScalingGroupMaxSize = 'scaling-group-max-size',
    ResourceTagPrefix = 'resource-tag-prefix',
    VmInfoCacheTime = 'vm-info-cache-time',
    VpnBgpAsn = 'vpn-bgp-asn'
}

export interface SettingItemDefinition {
    keyName: string;
    description: string;
    editable: boolean;
    jsonEncoded: boolean;
    booleanType: boolean;
}

export interface SubnetPair {
    subnetId: string;
    pairIdList: string[];
}

export enum SubnetPairIndex {
    Service,
    Management
}

/**
 *
 *
 * @export
 * @class SettingItem
 */
export class SettingItem {
    static NO_VALUE = 'n/a';
    /**
     *Creates an instance of SettingItem.
     * @param {string} key setting key
     * @param {string} rawValue the value stored as string type,
     * for actual type of : string, number, boolean, etc.
     * @param {string} description description of this setting item
     * @param {boolean} editable a flag for whether the value should be editable after deployment or not
     * @param {string} jsonEncoded a flag for whether the value is a JSON object or not.
     * If yes, can get the JSON object from
     * calling the jsonValue of this setting item.
     */
    constructor(
        readonly key: string,
        private readonly rawValue: string,
        readonly description: string,
        readonly editable: boolean,
        readonly jsonEncoded: boolean
    ) {}
    /**
     * the string type value of the setting.
     *
     * @readonly
     * @type {string}
     */
    get value(): string {
        return this.rawValue.trim().toLowerCase() === SettingItem.NO_VALUE ? null : this.rawValue;
    }
    /**
     * Returns the object type of this setting if it is a JSON object,
     * or null if it isn't.
     *
     * @readonly
     * @type {{}}
     */
    get jsonValue(): JSONable {
        if (this.jsonEncoded) {
            try {
                return JSON.parse(this.value);
            } catch (error) {
                return null;
            }
        } else {
            return null;
        }
    }
    /**
     * Returns a truth value if the value of this setting is either a string 'true' or 'false'.
     * It's handy to be used in boolean comparisons.
     *
     * @readonly
     * @type {boolean}
     */
    get truthValue(): boolean {
        return this.value && this.value.trim().toLowerCase() === 'true';
    }

    /**
     * stringify this SettingItem
     * @returns {string} string
     */
    stringify(): string {
        return JSON.stringify({
            key: this.key,
            value: this.rawValue,
            description: this.description,
            editable: this.editable,
            jsonEncoded: this.jsonEncoded
        });
    }

    /**
     * parse a string as a SettingItem
     *
     * @static
     * @param {string} s string to parse
     * @returns {SettingItem} settingitem object
     */
    static parse(s: string): SettingItem {
        const o = JSON.parse(s);
        const k = Object.keys(o);
        if (
            !(
                k.includes('key') &&
                k.includes('value') &&
                k.includes('description') &&
                k.includes('editable') &&
                k.includes('jsonEncoded')
            )
        ) {
            throw new Error(
                `Unable to parse string (${s}) to SettingItem. Missing required properties.`
            );
        }
        return new SettingItem(o.key, o.value, o.description, o.editable, o.jsonEncoded);
    }
}

export type Settings = Map<string, SettingItem>;

export interface SettingItemDictionary {
    [key: string]: SettingItemDefinition;
}

export const AutoscaleSettingItemDictionary: SettingItemDictionary = {};

AutoscaleSettingItemDictionary[AutoscaleSetting.AdditionalConfigSetNameList] = {
    keyName: AutoscaleSetting.AdditionalConfigSetNameList,
    description:
        'The comma-separated list of the name of a configset. These configsets' +
        ' are required dependencies for the Autoscale to work for a certain ' +
        ' deployment. Can be left empty.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.AutoscaleHandlerUrl] = {
    keyName: AutoscaleSetting.AutoscaleHandlerUrl,
    description: 'The FortiGate Autoscale handler URL.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.AssetStorageContainer] = {
    keyName: AutoscaleSetting.AssetStorageContainer,
    description: 'Asset storage name.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.AssetStorageDirectory] = {
    keyName: AutoscaleSetting.AssetStorageDirectory,
    description: 'Asset storage key prefix.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.ByolScalingGroupName] = {
    keyName: AutoscaleSetting.ByolScalingGroupName,
    description: 'The name of the BYOL auto scaling group.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.ByolScalingGroupDesiredCapacity] = {
    keyName: AutoscaleSetting.ByolScalingGroupDesiredCapacity,
    description: 'BYOL Scaling group desired capacity.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.ByolScalingGroupMinSize] = {
    keyName: AutoscaleSetting.ByolScalingGroupMinSize,
    description: 'BYOL Scaling group min size.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.ByolScalingGroupMaxSize] = {
    keyName: AutoscaleSetting.ByolScalingGroupMaxSize,
    description: 'BYOL Scaling group max size.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.CustomAssetContainer] = {
    keyName: AutoscaleSetting.CustomAssetContainer,
    description:
        'The asset storage name for some user custom resources, such as: custom configset, license files, etc.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.CustomAssetDirectory] = {
    keyName: AutoscaleSetting.CustomAssetDirectory,
    description: 'The sub directory to the user custom resources under the custom-asset-container.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.EnableNic2] = {
    keyName: AutoscaleSetting.EnableNic2,
    description: 'Toggle ON / OFF the secondary eni creation on each FortiGate instance.',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

AutoscaleSettingItemDictionary[AutoscaleSetting.EnableHybridLicensing] = {
    keyName: AutoscaleSetting.EnableHybridLicensing,
    description: 'Toggle ON / OFF the hybrid licensing feature.',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

AutoscaleSettingItemDictionary[AutoscaleSetting.EnableInternalElb] = {
    keyName: AutoscaleSetting.EnableInternalElb,
    description:
        'Toggle ON / OFF the internal elastic load balancing for the protected services by FortiGate.',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

AutoscaleSettingItemDictionary[AutoscaleSetting.EnableVmInfoCache] = {
    keyName: AutoscaleSetting.EnableVmInfoCache,
    description:
        'Toggle ON / OFF the vm info cache feature. It caches the ' +
        'vm info in db to reduce API calls to query a vm from the platform.',
    editable: false,
    jsonEncoded: false,
    booleanType: true
};

AutoscaleSettingItemDictionary[AutoscaleSetting.HeartbeatDelayAllowance] = {
    keyName: AutoscaleSetting.HeartbeatDelayAllowance,
    description: 'The FortiGate sync heartbeat delay allowance time in second.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.HeartbeatInterval] = {
    keyName: AutoscaleSetting.HeartbeatInterval,
    description: 'The FortiGate sync heartbeat interval in second.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.HeartbeatLossCount] = {
    keyName: AutoscaleSetting.HeartbeatLossCount,
    description: 'The FortiGate sync heartbeat loss count.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.LicenseFileDirectory] = {
    keyName: AutoscaleSetting.LicenseFileDirectory,
    description: 'The sub directory for storing license files under the asset container.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.MasterElectionTimeout] = {
    keyName: AutoscaleSetting.MasterElectionTimeout,
    description: 'The FortiGate master election timtout time in second.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.MasterScalingGroupName] = {
    keyName: AutoscaleSetting.MasterScalingGroupName,
    description: 'The name of the master auto scaling group.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.PaygScalingGroupName] = {
    keyName: AutoscaleSetting.PaygScalingGroupName,
    description: 'The name of the PAYG auto scaling group.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.PaygScalingGroupDesiredCapacity] = {
    keyName: AutoscaleSetting.PaygScalingGroupDesiredCapacity,
    description: 'PAYG Scaling group desired capacity.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.PaygScalingGroupMinSize] = {
    keyName: AutoscaleSetting.PaygScalingGroupMinSize,
    description: 'PAYG Scaling group min size.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.PaygScalingGroupMaxSize] = {
    keyName: AutoscaleSetting.PaygScalingGroupMaxSize,
    description: 'PAYG Scaling group max size.',
    editable: false,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.ResourceTagPrefix] = {
    keyName: AutoscaleSetting.ResourceTagPrefix,
    description: 'Resource tag prefix.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.VpnBgpAsn] = {
    keyName: AutoscaleSetting.VpnBgpAsn,
    description: 'The BGP Autonomous System Number used with the VPN connections.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};

AutoscaleSettingItemDictionary[AutoscaleSetting.VmInfoCacheTime] = {
    keyName: AutoscaleSetting.VmInfoCacheTime,
    description: 'The vm info cache time in seconds.',
    editable: true,
    jsonEncoded: false,
    booleanType: false
};
