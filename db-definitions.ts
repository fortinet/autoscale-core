export interface Attribute {
    name: string;
    attrType: TypeRef | string;
    isKey: boolean;
    keyType?: TypeRef | string;
}

export interface KeyValue {
    key: string;
    value: string;
}

export interface SchemaElement {
    name: string;
    keyType: TypeRef | string;
}
export type TypeRefMap = Map<TypeRef, string>;

export enum TypeRef {
    StringType = 'AutoscaleStringType',
    NumberType = 'AutoscaleStringType',
    BooleanType = 'AutoscaleBooleanType',
    PrimaryKey = 'AutoscaleStringType',
    SecondaryKey = 'AutoscaleStringType'
}

export interface Record {
    [key: string]: unknown;
}

export enum CreateOrUpdate {
    unknown,
    CreateOrReplace,
    UpdateExisting
}

/**
 * must be implement to provide platform specific data type conversion
 *
 * @export
 * @abstract
 * @class TypeConvert
 */
export abstract class TypeConverter {
    /**
     * convert a value of string type stored in the db to a js primitive string type
     *
     * @abstract
     * @param {unknown} value
     * @returns {string}
     */
    abstract valueToString(value: unknown): string;
    /**
     * convert a value of number type stored in the db to a js primitive number type
     *
     * @abstract
     * @param {unknown} value
     * @returns {number}
     */
    abstract valueToNumber(value: unknown): number;
    /**
     * convert a value of boolean type stored in the db to a js boolean primitive type
     *
     * @abstract
     * @param {unknown} value
     * @returns {boolean}
     */
    abstract valueToBoolean(value: unknown): boolean;
}

export abstract class Table<T> {
    static TypeRefMap: Map<TypeRef, string> = new Map<TypeRef, string>([
        [TypeRef.StringType, 'String'],
        [TypeRef.NumberType, 'Number'],
        [TypeRef.BooleanType, 'Boolean'],
        [TypeRef.PrimaryKey, 'PrimaryKey'],
        [TypeRef.SecondaryKey, 'SecondaryKey']
    ]);
    private _name: string;
    protected _schema: Map<string, SchemaElement>;
    protected _keys: Map<string, Attribute>;
    protected _attributes: Map<string, Attribute>;
    constructor(
        readonly typeConvert: TypeConverter,
        readonly namePrefix: string = '',
        readonly nameSuffix: string = ''
    ) {}
    /**
     * validate the input before putting into the database
     * @param {T} input the input object to be validated
     * @throws an Error object
     */
    validateInput<T>(input: T): void {
        const keys = Object.keys(input);
        this.attributes.forEach(attrName => {
            if (!keys.includes) {
                throw new Error(`Table [${this.name}] required attribute [${attrName}] not found.`);
            }
        });
    }

    /**
     * Set the name of the table (not include prefix or suffix)
     * @param {string} n name of the table
     */
    protected setName(n: string): void {
        this._name = n;
    }
    /**
     * Table name (with prefix and suffix if provided)
     */
    get name(): string {
        return this.namePrefix + this._name + this.nameSuffix;
    }
    /**
     * Table schema
     */
    get schema(): Map<string, SchemaElement> {
        if (!this._schema) {
            this._schema = new Map(
                Array.from(this._attributes.values())
                    .filter(attr => attr.isKey)
                    .map(a => [
                        a.name,
                        {
                            name: a.name,
                            keyType: a.keyType
                        } as SchemaElement
                    ])
            );
        }
        return this._schema;
    }
    /**
     * Table Key attributes
     */
    get keys(): Map<string, Attribute> {
        if (!this._keys) {
            this._keys = new Map(
                Array.from(this._attributes.values())
                    .filter(attr => attr.isKey)
                    .map(a => [a.name, a])
            );
        }
        return this._keys;
    }
    /**
     * Table all attributes including key attributes
     */
    get attributes(): Map<string, Attribute> {
        return this._attributes;
    }

    get primaryKey(): Attribute {
        const [pk] = Array.from(this._keys.values()).filter(
            key => key.keyType === TypeRef.PrimaryKey
        );
        return pk;
    }

    /**
     * Alter the type of each attribute using a given type reference map.
     * Every attribute in the Autoscale generic Table uses a TypeRef refernce as its type.
     * The reason is table attribute type and key type may vary in different platforms,
     * the platform-specific derived Table classes are intended to be a concrete class
     * with a determined type.
     * @param {TypeRefMap} typeRefs attribute type reference map
     */
    protected alterAttributesUsingTypeReference(typeRefs: TypeRefMap): void {
        const typeRefValues = Object.values<string>(TypeRef);
        Array.from(this._attributes.keys()).forEach(name => {
            const attr = this._attributes.get(name);
            if (attr.keyType && typeRefValues.indexOf(attr.keyType)) {
                attr.keyType = typeRefs.get(attr.keyType as TypeRef);
            }
            if (attr.attrType && typeRefValues.indexOf(attr.attrType)) {
                attr.attrType = typeRefs.get(attr.attrType as TypeRef);
            }
            this._attributes.set(attr.name, attr);
        });
    }
    /**
     * Alter the table attribute definitions. Provide ability to change db definition in a derived
     * class for a certain platform.
     * @param {Attribute[]} definitions new definitions to use
     */
    alterAttributes(definitions: Attribute[]): void {
        let dirty = false;
        definitions.forEach(def => {
            if (this._attributes.has(def.name)) {
                dirty = true;
                const attr: Attribute = {
                    name: def.name,
                    isKey: def.isKey,
                    attrType: def.attrType
                };
                if (def.isKey && def.keyType) {
                    attr.keyType = def.keyType;
                }
                this._attributes.set(attr.name, attr);
            }
        });
        // recreate key and schema
        if (dirty) {
            this._keys = null;
            this._schema = null;
        }
    }
    addAttribute(attr: Attribute): void {
        this.alterAttributes([attr]);
    }
    // NOTE: no deleting attribute method should be provided.
    abstract convertRecord(record: Record): T;
    assign(target: T, record: Record): void {
        for (const p in Object.keys(target)) {
            if (typeof p === 'string') {
                target[p] = this.typeConvert.valueToString(record[p]);
            } else if (typeof p === 'number') {
                target[p] = this.typeConvert.valueToNumber(record[p]);
            } else if (typeof p === 'boolean') {
                target[p] = this.typeConvert.valueToBoolean(record[p]);
            }
        }
    }
}
export interface AutoscaleDbItem {
    vmId: string;
    scalingGroupName: string;
    ip: string;
    masterIp: string;
    heartBeatInterval: number;
    heartBeatLossCount: number;
    nextHeartBeatTime: number;
    syncState: string;
    seq: number;
}

export abstract class Autoscale extends Table<AutoscaleDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'masterIp',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'heartBeatLossCount',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'heartBeatInterval',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'nextHeartBeatTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'syncState',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'seq',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Autoscale');
        this.alterAttributes(Autoscale.__attributes);
    }
    convertRecord(record: Record): AutoscaleDbItem {
        const item: AutoscaleDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            ip: this.typeConvert.valueToString(record.masterIp),
            masterIp: this.typeConvert.valueToString(record.masterIp),
            heartBeatLossCount: this.typeConvert.valueToNumber(record.heartBeatLossCount),
            heartBeatInterval: this.typeConvert.valueToNumber(record.heartBeatInterval),
            nextHeartBeatTime: this.typeConvert.valueToNumber(record.nextHeartBeatTime),
            syncState: this.typeConvert.valueToString(record.syncState),
            seq: this.typeConvert.valueToNumber(record.seq)
        };
        return item;
    }
}
export interface MasterElectionDbItem {
    scalingGroupName: string;
    vmId: string;
    id: string;
    ip: string;
    virtualNetworkId: string;
    subnetId: string;
    voteEndTime: number;
    voteState: string;
}
export abstract class MasterElection extends Table<MasterElectionDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'virtualNetworkId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'subnetId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'voteEndTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'voteState',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('MasterElection');
        this.alterAttributes(MasterElection.__attributes);
    }
    convertRecord(record: Record): MasterElectionDbItem {
        const item: MasterElectionDbItem = {
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            vmId: this.typeConvert.valueToString(record.vmId),
            id: this.typeConvert.valueToString(record.id),
            ip: this.typeConvert.valueToString(record.ip),
            virtualNetworkId: this.typeConvert.valueToString(record.virtualNetworkId),
            subnetId: this.typeConvert.valueToString(record.subnetId),
            voteEndTime: this.typeConvert.valueToNumber(record.voteEndTime),
            voteState: this.typeConvert.valueToString(record.voteState)
        };
        return item;
    }
}
export interface FortiAnalyzerDbItem {
    vmId: string;
    ip: string;
    master: string;
    vip: string;
}

export abstract class FortiAnalyzer extends Table<FortiAnalyzerDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'ip',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'master',
            attrType: TypeRef.BooleanType,
            isKey: false
        },
        {
            name: 'vip',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('FortiAnalyzer');
        this.alterAttributes(FortiAnalyzer.__attributes);
    }
    convertRecord(record: Record): FortiAnalyzerDbItem {
        const item: FortiAnalyzerDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            ip: this.typeConvert.valueToString(record.ip),
            master: this.typeConvert.valueToString(record.master),
            vip: this.typeConvert.valueToString(record.vip)
        };
        return item;
    }
}
export interface SettingsDbItem {
    settingKey: string;
    settingValue: string;
    description: string;
    jsonEncoded: boolean;
    editable: boolean;
}
export abstract class Settings extends Table<SettingsDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'settingKey',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'settingValue',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'description',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'jsonEncoded',
            attrType: TypeRef.BooleanType,
            isKey: false
        },
        {
            name: 'editable',
            attrType: TypeRef.BooleanType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Settings');
        this.alterAttributes(Settings.__attributes);
    }
    convertRecord(record: Record): SettingsDbItem {
        const item: SettingsDbItem = {
            settingKey: this.typeConvert.valueToString(record.settingKey),
            settingValue: this.typeConvert.valueToString(record.settingValue),
            description: this.typeConvert.valueToString(record.description),
            jsonEncoded: this.typeConvert.valueToBoolean(record.jsonEncoded),
            editable: this.typeConvert.valueToBoolean(record.editable)
        };
        return item;
    }
}
export interface NicAttachmentDbItem {
    vmId: string;
    nicId: string;
    attachmentState: string;
}
export abstract class NicAttachment extends Table<NicAttachmentDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'nicId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'attachmentState',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('NicAttachment');
        this.alterAttributes(NicAttachment.__attributes);
    }
    convertRecord(record: Record): NicAttachmentDbItem {
        const item: NicAttachmentDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            nicId: this.typeConvert.valueToString(record.nicId),
            attachmentState: this.typeConvert.valueToString(record.attachmentState)
        };
        return item;
    }
}

export interface VmInfoCacheDbItem {
    id: string;
    vmId: string;
    index: number;
    scalingGroupName: string;
    info: string;
    timestamp: number;
    expireTime: number;
}
export abstract class VmInfoCache extends Table<VmInfoCacheDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'index',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'info',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'timestamp',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'expireTime',
            attrType: TypeRef.NumberType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VmInfoCache');
        this.alterAttributes(VmInfoCache.__attributes);
    }
    convertRecord(record: Record): VmInfoCacheDbItem {
        const item: VmInfoCacheDbItem = {
            id: this.typeConvert.valueToString(record.id),
            vmId: this.typeConvert.valueToString(record.vmId),
            index: this.typeConvert.valueToNumber(record.index),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            info: this.typeConvert.valueToString(record.info),
            timestamp: this.typeConvert.valueToNumber(record.timestamp),
            expireTime: this.typeConvert.valueToNumber(record.expireTime)
        };
        return item;
    }
}

export interface LicenseStockDbItem {
    checksum: string;
    algorithm: string;
    fileName: string;
    productName: string;
}
export abstract class LicenseStock extends Table<LicenseStockDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'checksum',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'algorithm',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'fileName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'productName',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseStock');
        this.alterAttributes(LicenseStock.__attributes);
    }
    convertRecord(record: Record): LicenseStockDbItem {
        const item: LicenseStockDbItem = {
            checksum: this.typeConvert.valueToString(record.checksum),
            algorithm: this.typeConvert.valueToString(record.algorithm),
            fileName: this.typeConvert.valueToString(record.fileName),
            productName: this.typeConvert.valueToString(record.productName)
        };
        return item;
    }
}

export interface LicenseUsageDbItem {
    checksum: string;
    algorithm: string;
    fileName: string;
    productName: string;
    vmId: string;
    scalingGroupName: string;
    assignedTime: number;
    vmInSync: boolean;
}
export abstract class LicenseUsage extends Table<LicenseUsageDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'checksum',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'fileName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'algorithm',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'product',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'assignedTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'vmInSync',
            attrType: TypeRef.BooleanType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseUsage');
        this.alterAttributes(LicenseUsage.__attributes);
    }
    convertRecord(record: Record): LicenseUsageDbItem {
        const item: LicenseUsageDbItem = {
            checksum: this.typeConvert.valueToString(record.checksum),
            fileName: this.typeConvert.valueToString(record.fileName),
            algorithm: this.typeConvert.valueToString(record.algorithm),
            productName: this.typeConvert.valueToString(record.product),
            vmId: this.typeConvert.valueToString(record.vmId),
            scalingGroupName: this.typeConvert.valueToString(record.scalingGroupName),
            assignedTime: this.typeConvert.valueToNumber(record.assignedTime),
            vmInSync: this.typeConvert.valueToBoolean(record.vmInSync)
        };
        return item;
    }
}

export interface CustomLogDbItem {
    id: string;
    timestamp: number;
    logContent: string;
}
export abstract class CustomLog extends Table<CustomLogDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'timestamp',
            attrType: TypeRef.NumberType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        },
        {
            name: 'logContent',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('CustomLog');
        this.alterAttributes(CustomLog.__attributes);
    }
    convertRecord(record: Record): CustomLogDbItem {
        const item: CustomLogDbItem = {
            id: this.typeConvert.valueToString(record.id),
            timestamp: this.typeConvert.valueToNumber(record.timestamp),
            logContent: this.typeConvert.valueToString(record.logContent)
        };
        return item;
    }
}

export interface VpnAttachmentDbItem {
    vmId: string;
    publicIp: string;
    customerGatewayId: string;
    vpnConnectionId: string;
    configuration: string;
}
export abstract class VpnAttachment extends Table<VpnAttachmentDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'publicIp',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        },
        {
            name: 'customerGatewayId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'vpnConnectionId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'configuration',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(typeConvert, namePrefix = '', nameSuffix = '') {
        super(typeConvert, namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VpnAttachment');
        this.alterAttributes(VpnAttachment.__attributes);
    }
    convertRecord(record: Record): VpnAttachmentDbItem {
        const item: VpnAttachmentDbItem = {
            vmId: this.typeConvert.valueToString(record.vmId),
            publicIp: this.typeConvert.valueToString(record.publicIp),
            customerGatewayId: this.typeConvert.valueToString(record.customerGatewayId),
            vpnConnectionId: this.typeConvert.valueToString(record.vpnConnectionId),
            configuration: this.typeConvert.valueToString(record.configuration)
        };
        return item;
    }
}
