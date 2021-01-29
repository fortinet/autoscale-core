import {
    ApiRequestCache,
    ApiRequestCacheDbItem,
    Attribute,
    Autoscale,
    AutoscaleDbItem,
    BidirectionalCastable,
    CustomLog,
    CustomLogDbItem,
    FortiAnalyzer,
    FortiAnalyzerDbItem,
    LicenseStock,
    LicenseStockDbItem,
    LicenseUsage,
    LicenseUsageDbItem,
    PrimaryElection,
    PrimaryElectionDbItem,
    Record,
    Settings,
    SettingsDbItem,
    Table,
    TypeConverter,
    TypeRef,
    TypeRefMap,
    VmInfoCache,
    VmInfoCacheDbItem
} from '../../db-definitions';

// NOTE: Azure Cosmos DB Data modeling concepts
// see: https://docs.microsoft.com/en-us/azure/cosmos-db/modeling-data
// Cosmos DB is a schema-free type of database so the data type definitions have no effect on
// items.
// The types here are still given just for good readabilty.
export const AzureTypeRefs: TypeRefMap = new Map<TypeRef, string>([
    [TypeRef.StringType, 'string'],
    [TypeRef.NumberType, 'number'],
    [TypeRef.BooleanType, 'boolean'],
    [TypeRef.PrimaryKey, 'hash'],
    [TypeRef.SecondaryKey, 'range']
]);

export interface CosmosDBQueryWhereClause {
    name: string;
    value: string;
}

export interface CosmosDBQueryResult<T> {
    result: T[];
    query?: string;
}

// CosmosDB table has some useful meta properties added to each item
// they are defined here below
export interface CosmosDbTableMetaData {
    id: string;
    _rid: string;
    _self: string;
    _etag: string;
    _attachments: string;
    _ts: number;
    [key: string]: string | number | boolean;
}

export const CosmosDbTableMetaDataAttributes = [
    {
        name: 'id',
        attrType: TypeRef.StringType,
        isKey: false
    },
    {
        name: '_attachments',
        attrType: TypeRef.StringType,
        isKey: false
    },
    {
        name: '_etag',
        attrType: TypeRef.StringType,
        isKey: false
    },
    {
        name: '_rid',
        attrType: TypeRef.StringType,
        isKey: false
    },
    {
        name: '_self',
        attrType: TypeRef.StringType,
        isKey: false
    },
    {
        name: '_ts',
        attrType: TypeRef.NumberType,
        isKey: false
    }
];

export class CosmosDBTypeConverter extends TypeConverter {
    valueToString(value: unknown): string {
        return value as string;
    }
    valueToNumber(value: unknown): number {
        return Number(value as string);
    }
    valueToBoolean(value: unknown): boolean {
        return !!value;
    }
}

export interface AzureAutoscaleDbItem extends AutoscaleDbItem, CosmosDbTableMetaData {}

export class AzureAutoscale extends Autoscale
    implements BidirectionalCastable<AutoscaleDbItem, AzureAutoscaleDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureAutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: AutoscaleDbItem): AzureAutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureAutoscaleDbItem): AutoscaleDbItem {
        const item: AzureAutoscaleDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzurePrimaryElectionDbItem extends PrimaryElectionDbItem, CosmosDbTableMetaData {}
export class AzurePrimaryElection extends PrimaryElection
    implements BidirectionalCastable<PrimaryElectionDbItem, AzurePrimaryElectionDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzurePrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: PrimaryElectionDbItem): AzurePrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzurePrimaryElectionDbItem): PrimaryElectionDbItem {
        const item: AzurePrimaryElectionDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureFortiAnalyzerDbItem extends FortiAnalyzerDbItem, CosmosDbTableMetaData {}

export class AzureFortiAnalyzer extends FortiAnalyzer
    implements BidirectionalCastable<FortiAnalyzerDbItem, AzureFortiAnalyzerDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureFortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: FortiAnalyzerDbItem): AzureFortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureFortiAnalyzerDbItem): FortiAnalyzerDbItem {
        const item: AzureFortiAnalyzerDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureSettingsDbItem extends SettingsDbItem, CosmosDbTableMetaData {}

export class AzureSettings extends Settings
    implements BidirectionalCastable<SettingsDbItem, AzureSettingsDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }

    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureSettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: SettingsDbItem): AzureSettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureSettingsDbItem): SettingsDbItem {
        const item: AzureSettingsDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureVmInfoCacheDbItem extends VmInfoCacheDbItem, CosmosDbTableMetaData {}

export class AzureVmInfoCache extends VmInfoCache
    implements BidirectionalCastable<VmInfoCacheDbItem, AzureVmInfoCacheDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureVmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: VmInfoCacheDbItem): AzureVmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureVmInfoCacheDbItem): VmInfoCacheDbItem {
        const item: AzureVmInfoCacheDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureLicenseStockDbItem extends LicenseStockDbItem, CosmosDbTableMetaData {}

export class AzureLicenseStock extends LicenseStock
    implements BidirectionalCastable<LicenseStockDbItem, AzureLicenseStockDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureLicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: LicenseStockDbItem): AzureLicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureLicenseStockDbItem): LicenseStockDbItem {
        const item: AzureLicenseStockDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureLicenseUsageDbItem extends LicenseUsageDbItem, CosmosDbTableMetaData {}

export class AzureLicenseUsage extends LicenseUsage
    implements BidirectionalCastable<LicenseUsageDbItem, AzureLicenseUsageDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureLicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...super.convertRecord(record),
            id: this.typeConvert.valueToString(record.id),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: LicenseUsageDbItem): AzureLicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureLicenseUsageDbItem): LicenseUsageDbItem {
        const item: AzureLicenseUsageDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureCustomLogDbItem extends CustomLogDbItem, CosmosDbTableMetaData {}

export class AzureCustomLog extends CustomLog
    implements BidirectionalCastable<CustomLogDbItem, AzureCustomLogDbItem> {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new CosmosDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureCustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...super.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        return item;
    }

    downcast(record: CustomLogDbItem): AzureCustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureCustomLogDbItem): CustomLogDbItem {
        const item: AzureCustomLogDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}

export interface AzureApiRequestCacheDbItem extends ApiRequestCacheDbItem, CosmosDbTableMetaData {}

export class AzureApiRequestCache extends Table<AzureApiRequestCacheDbItem>
    implements BidirectionalCastable<ApiRequestCacheDbItem, AzureApiRequestCacheDbItem> {
    static __attributes: Attribute[] = [
        ...ApiRequestCache.__attributes, // NOTE: use the same attributes of a sibling class
        ...CosmosDbTableMetaDataAttributes // NOTE: add addtional Azure CosmosDB table meta data attributes
    ];
    private siblingClass: ApiRequestCache;
    constructor(namePrefix = '', nameSuffix = '') {
        const converter = new CosmosDBTypeConverter();
        super(converter, namePrefix, nameSuffix);
        // NOTE: set the sibling class reference
        this.siblingClass = new ApiRequestCache(converter, namePrefix, nameSuffix);
        // NOTE: use Azure CosmosDB type refs
        this.alterAttributesUsingTypeReference(AzureTypeRefs);
        // CAUTION: don't forget to set a correct name.
        this.setName(this.siblingClass.name);
        // CAUTION: don't forget to add attributes
        AzureApiRequestCache.__attributes.forEach(def => {
            this.addAttribute(def);
        });
    }
    /**
     * @override override to provide additional meta data
     */
    convertRecord(record: Record): AzureApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...this.siblingClass.convertRecord(record),
            _attachments: this.typeConvert.valueToString(record._attachments),
            _etag: this.typeConvert.valueToString(record._etag),
            _rid: this.typeConvert.valueToString(record._rid),
            _self: this.typeConvert.valueToString(record._self),
            _ts: this.typeConvert.valueToNumber(record._ts)
        };
        // NOTE: the cacheTime property will use the value of _ts
        item.cacheTime = item._ts;
        return item;
    }

    downcast(record: ApiRequestCacheDbItem): AzureApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...record,
            // NOTE: id will be automatically use the primary key value
            // if the record already has property 'id', the following assignmet will overwrite
            // the id value.
            id: String(record[this.primaryKey.name]),
            _attachments: undefined,
            _etag: undefined,
            _rid: undefined,
            _self: undefined,
            _ts: undefined
        };
        return item;
    }

    upcast(record: AzureApiRequestCacheDbItem): ApiRequestCacheDbItem {
        const item: AzureApiRequestCacheDbItem = {
            ...record
        };
        delete item._attachments;
        delete item._etag;
        delete item._rid;
        delete item._self;
        delete item._ts;
        // delete id only if id is not the primary key
        if (this.primaryKey.name !== 'id') {
            delete item.id;
        }
        return { ...item };
    }
}
