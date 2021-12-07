import * as DBDef from '../db-definitions';

export const AwsTypeRefs: DBDef.TypeRefMap = new Map<DBDef.TypeRef, string>([
    [DBDef.TypeRef.StringType, 'S'],
    [DBDef.TypeRef.NumberType, 'N'],
    [DBDef.TypeRef.BooleanType, 'BOOL'],
    [DBDef.TypeRef.PrimaryKey, 'HASH'],
    [DBDef.TypeRef.SecondaryKey, 'RANGE']
]);

export class DynamoDBTypeConverter extends DBDef.TypeConverter {
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
export class AwsAutoscale extends DBDef.Autoscale {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsPrimaryElection extends DBDef.PrimaryElection {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsFortiAnalyzer extends DBDef.FortiAnalyzer {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsSettings extends DBDef.Settings {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsNicAttachment extends DBDef.NicAttachment {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVmInfoCache extends DBDef.VmInfoCache {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseStock extends DBDef.LicenseStock {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseUsage extends DBDef.LicenseUsage {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsCustomLog extends DBDef.CustomLog {
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVpnAttachment extends DBDef.VpnAttachment {
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
export class AwsLifecycleItem extends DBDef.Table<LifecycleItemDbItem> {
    static ownStaticAttributes: DBDef.Attribute[] = [
        {
            name: 'vmId',
            attrType: DBDef.TypeRef.StringType,
            isKey: true,
            keyType: DBDef.TypeRef.PrimaryKey
        },
        {
            name: 'scalingGroupName',
            attrType: DBDef.TypeRef.StringType,
            isKey: false
        },
        {
            name: 'actionResult',
            attrType: DBDef.TypeRef.StringType,
            isKey: false
        },
        {
            name: 'actionToken',
            attrType: DBDef.TypeRef.StringType,
            isKey: false
        },
        {
            name: 'hookName',
            attrType: DBDef.TypeRef.StringType,
            isKey: false
        },
        {
            name: 'state',
            attrType: DBDef.TypeRef.StringType,
            isKey: false
        },
        {
            name: 'timestamp',
            attrType: DBDef.TypeRef.NumberType,
            isKey: false
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(new DynamoDBTypeConverter(), namePrefix, nameSuffix);
        // Caution: don't forget to set a correct name.
        this.setName('LifecycleItem');
        AwsLifecycleItem.ownStaticAttributes.forEach(def => {
            this.addAttribute(def);
        });
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }

    convertRecord(record: DBDef.Record): LifecycleItemDbItem {
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
