/**
 * Enumerated value of SettingItem keys
 *
 * @export
 * @enum {number}
 */
export enum AutoscaleSetting {
    AutoscaleHandlerUrl = 'autoscale-handler-url',
    AssetStorageContainer = 'asset-storage-name',
    AssetStorageDirectory = 'asset-storage-key-prefix',
    ByolScalingGroupName = 'byol-scaling-group-name',
    EnableNic2 = 'enable-second-nic',
    EnableInternalElb = 'enable-internal-elb',
    EnableFazIntegration = 'enable-fortianalyzer-integration',
    HeartbeatDelayAllowance = 'heartbeat-delay-allowance',
    HeartbeatInterval = 'heartbeat-interval',
    HeartbeatLossCount = 'heartbeat-loss-count',
    HeartbeatSyncActionUnhealthyVm = 'heartbeat-sync-action-unhealthy-vm',
    LicenseFIleDirectory = 'licens-file-directory',
    MasterElectionTimeout = 'master-election-timeout',
    MasterScalingGroupName = 'master-scaling-group-name',
    PaygScalingGroupName = 'payg-scaling-group-name',
    RequiredConfigSet = 'required-configset',
    ResourceTagPrefix = 'resource-tag-prefix',
    SubnetPairs = 'subnet-pairs'
}

export interface SubnetPair {
    subnetId: string;
    pairId: string;
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
     * @type {(string | null)}
     */
    get value(): string | null {
        return (
            (this.rawValue.trim().toLowerCase() === SettingItem.NO_VALUE && null) || this.rawValue
        );
    }
    /**
     * Returns the object type of this setting if it is a JSON object,
     * or null if it isn't.
     *
     * @readonly
     * @type {({} | null)}
     */
    get jsonValue(): {} | null {
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
