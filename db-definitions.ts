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

export class Table {
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
    validateInput(input: {}): void {
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
}

export class Autoscale extends Table {
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
            name: 'masterIp',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'syncState',
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
export class MasterElection extends Table {
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
}

export class FortiAnalyzer extends Table {
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
}

export class Settings extends Table {
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
}
export interface NicAttachmentDbItem {
    vmId: string;
    nicId: string;
    attachmentState: string;
}
export class NicAttachment extends Table {
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
}

export class VmInfoCache extends Table {
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
}

export class LicenseStock extends Table {
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
}

export class LicenseUsage extends Table {
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
}

export class CustomLog extends Table {
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
}

export class VpnAttachment extends Table {
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
}
