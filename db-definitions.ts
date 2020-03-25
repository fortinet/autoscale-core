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
    create,
    update
}

export interface DbTable {
    readonly name: string;
    readonly primaryKey: Attribute;
    readonly schema: Map<string, SchemaElement>;
    readonly keys: Map<string, Attribute>;
    readonly attributes: Map<string, Attribute>;
    validateInput(input: Record): void;
}

export abstract class Table<T> implements DbTable {
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
    constructor(readonly namePrefix: string = '', readonly nameSuffix: string = '') {}
    /**
     * validate the input before putting into the database
     * @param {{}} input the input object to be validated
     * @throws an Error object
     */
    validateInput(input: Record): void {
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
export class Autoscale extends Table<AutoscaleDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Autoscale');
        this.alterAttributes(Autoscale.__attributes);
    }
    convertRecord(record: Record): AutoscaleDbItem {
        const item: AutoscaleDbItem = {
            vmId: record.vmId as string,
            scalingGroupName: record.scalingGroupName as string,
            ip: record.masterIp as string,
            masterIp: record.masterIp as string,
            heartBeatLossCount: Number(record.heartBeatLossCount as string),
            heartBeatInterval: Number(record.heartBeatInterval as string),
            nextHeartBeatTime: Number(record.nextHeartBeatTime as string),
            syncState: record.syncState as string,
            seq: Number(record.seq as string)
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
    voteEndTime: string;
    voteState: string;
}
export class MasterElection extends Table<MasterElectionDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('MasterElection');
        this.alterAttributes(MasterElection.__attributes);
    }
    convertRecord(record: Record): MasterElectionDbItem {
        const item: MasterElectionDbItem = {
            scalingGroupName: record.scalingGroupName as string,
            vmId: record.vmId as string,
            id: record.id as string,
            ip: record.ip as string,
            virtualNetworkId: record.virtualNetworkId as string,
            subnetId: record.subnetId as string,
            voteEndTime: record.voteEndTime as string,
            voteState: record.voteState as string
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

export class FortiAnalyzer extends Table<FortiAnalyzerDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('FortiAnalyzer');
        this.alterAttributes(FortiAnalyzer.__attributes);
    }
    convertRecord(record: Record): FortiAnalyzerDbItem {
        const item: FortiAnalyzerDbItem = {
            vmId: record.vmId as string,
            ip: record.ip as string,
            master: record.master as string,
            vip: record.vip as string
        };
        return item;
    }
}
export interface SettingsDbItem {
    settingKey: string;
    settingValue: string;
    description: string;
    jsonEncoded: string;
    editable: string;
}
export class Settings extends Table<SettingsDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('Settings');
        this.alterAttributes(Settings.__attributes);
    }
    convertRecord(record: Record): SettingsDbItem {
        const item: SettingsDbItem = {
            settingKey: record.settingKey as string,
            settingValue: record.settingValue as string,
            description: record.description as string,
            jsonEncoded: record.jsonEncoded as string,
            editable: record.editable as string
        };
        return item;
    }
}
export interface NicAttachmentDbItem {
    vmId: string;
    nicId: string;
    attachmentState: string;
}
export class NicAttachment extends Table<NicAttachmentDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('NicAttachment');
        this.alterAttributes(NicAttachment.__attributes);
    }
    convertRecord(record: Record): NicAttachmentDbItem {
        const item: NicAttachmentDbItem = {
            vmId: record.vmId as string,
            nicId: record.nicId as string,
            attachmentState: record.attachmentState as string
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
export class VmInfoCache extends Table<VmInfoCacheDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VmInfoCache');
        this.alterAttributes(VmInfoCache.__attributes);
    }
    convertRecord(record: Record): VmInfoCacheDbItem {
        const item: VmInfoCacheDbItem = {
            id: record.id as string,
            vmId: record.vmId as string,
            index: record.index as number,
            scalingGroupName: record.scalingGroupName as string,
            info: record.info as string,
            timestamp: Number(record.timestamp as string),
            expireTime: Number(record.expireTime as string)
        };
        return item;
    }
}

export interface LicenseStockDbItem {
    checksum: string;
    fileName: string;
    algorithm: string;
}
export class LicenseStock extends Table<LicenseStockDbItem> {
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
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseStock');
        this.alterAttributes(LicenseStock.__attributes);
    }
    convertRecord(record: Record): LicenseStockDbItem {
        const item: LicenseStockDbItem = {
            checksum: record.checksum as string,
            fileName: record.fileName as string,
            algorithm: record.algorithm as string
        };
        return item;
    }
}

export interface LicenseUsageDbItem {
    id: string;
    checksum: string;
    fileName: string;
    algorithm: string;
    scalingGroupName: string;
    vmId: string;
    assignedTime: number;
    blobKey: string;
}
export class LicenseUsage extends Table<LicenseUsageDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'checksum',
            attrType: TypeRef.StringType,
            isKey: false
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
            name: 'scalingGroupName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'vmId',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'assignedTime',
            attrType: TypeRef.NumberType,
            isKey: false
        },
        {
            name: 'blobKey',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('LicenseUsage');
        this.alterAttributes(LicenseUsage.__attributes);
    }
    convertRecord(record: Record): LicenseUsageDbItem {
        const item: LicenseUsageDbItem = {
            id: record.id as string,
            checksum: record.checksum as string,
            fileName: record.fileName as string,
            algorithm: record.algorithm as string,
            scalingGroupName: record.scalingGroupName as string,
            vmId: record.vmId as string,
            assignedTime: Number(record.assignedTime as string),
            blobKey: record.blobKey as string
        };
        return item;
    }
}

export interface CustomLogDbItem {
    id: string;
    timestamp: string;
    logContent: string;
}
export class CustomLog extends Table<CustomLogDbItem> {
    static __attributes: Attribute[] = [
        {
            name: 'id',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'timestamp',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        },
        {
            name: 'logContent',
            attrType: TypeRef.StringType,
            isKey: false
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('CustomLog');
        this.alterAttributes(CustomLog.__attributes);
    }
    convertRecord(record: Record): CustomLogDbItem {
        const item: CustomLogDbItem = {
            id: record.id as string,
            timestamp: record.timestamp as string,
            logContent: record.logContent as string
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
export class VpnAttachment extends Table<VpnAttachmentDbItem> {
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
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // CAUTION: don't forget to set a correct name.
        this.setName('VpnAttachment');
        this.alterAttributes(VpnAttachment.__attributes);
    }
    convertRecord(record: Record): VpnAttachmentDbItem {
        const item: VpnAttachmentDbItem = {
            vmId: record.vmId as string,
            publicIp: record.publicIp as string,
            customerGatewayId: record.customerGatewayId as string,
            vpnConnectionId: record.vpnConnectionId as string,
            configuration: record.configuration as string
        };
        return item;
    }
}
