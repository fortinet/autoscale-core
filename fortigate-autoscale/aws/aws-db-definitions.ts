import {
    Attribute,
    Autoscale,
    CustomLog,
    FortiAnalyzer,
    LicenseStock,
    LicenseUsage,
    NicAttachment,
    PrimaryElection,
    Record,
    Settings,
    Table,
    TypeConverter,
    TypeRef,
    TypeRefMap,
    VmInfoCache,
    VpnAttachment
} from '../../db-definitions';

export const AwsTypeRefs: TypeRefMap = new Map<TypeRef, string>([
    [TypeRef.StringType, 'S'],
    [TypeRef.NumberType, 'N'],
    [TypeRef.BooleanType, 'BOOL'],
    [TypeRef.PrimaryKey, 'HASH'],
    [TypeRef.SecondaryKey, 'RANGE']
]);

export class DynamoDBTypeConverter extends TypeConverter {
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
export class AwsAutoscale extends Autoscale {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsPrimaryElection extends PrimaryElection {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsFortiAnalyzer extends FortiAnalyzer {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsSettings extends Settings {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsNicAttachment extends NicAttachment {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVmInfoCache extends VmInfoCache {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseStock extends LicenseStock {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseUsage extends LicenseUsage {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsCustomLog extends CustomLog {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVpnAttachment extends VpnAttachment {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}

export interface LifecycleItemDbItem {
    vmId: string;
    scalingGroupName: string;
    actionResult: string;
    actionToken: string;
    hookName: string;
    state: string;
    timestamp: number;
}

// additional tables
export class AwsLifecycleItem extends Table<LifecycleItemDbItem> {
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
            name: 'actionResult',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'actionToken',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'hookName',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'state',
            attrType: TypeRef.StringType,
            isKey: false
        },
        {
            name: 'timestamp',
            attrType: TypeRef.NumberType,
            isKey: false
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // Caution: don't forget to set a correct name.
        this.setName('LifecycleItem');
        AwsLifecycleItem.__attributes.forEach(def => {
            this.addAttribute(def);
        });
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }

    convertRecord(record: Record): LifecycleItemDbItem {
        const item: LifecycleItemDbItem = {
            vmId: record.vmId as string,
            scalingGroupName: record.scalingGroupName as string,
            actionResult: record.actionResult as string,
            actionToken: record.actionToken as string,
            hookName: record.hookName as string,
            state: record.state as string,
            timestamp: record.timestamp as number
        };
        return item;
    }
}
