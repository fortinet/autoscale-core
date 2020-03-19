import {
    Table,
    Attribute,
    TypeRef,
    TypeRefMap,
    Autoscale,
    MasterElection,
    FortiAnalyzer,
    Settings,
    NicAttachment,
    VmInfoCache,
    LicenseStock,
    LicenseUsage,
    CustomLog,
    VpnAttachment
} from '../../db-definitions';

export { Table } from '../../db-definitions';

export const AwsTypeRefs: TypeRefMap = new Map<TypeRef, string>([
    [TypeRef.StringType, 'S'],
    [TypeRef.NumberType, 'N'],
    [TypeRef.BooleanType, 'BOOL'],
    [TypeRef.PrimaryKey, 'HASH'],
    [TypeRef.SecondaryKey, 'RANG']
]);
export class AwsAutoscale extends Autoscale {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsMasterElection extends MasterElection {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsFortiAnalyzer extends FortiAnalyzer {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsSettings extends Settings {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsNicAttachment extends NicAttachment {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVmInfoCache extends VmInfoCache {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseStock extends LicenseStock {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsLicenseUsage extends LicenseUsage {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsCustomLog extends CustomLog {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
export class AwsVpnAttachment extends VpnAttachment {
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}

// additional tables
export class LifecycleItem extends Table {
    static __attributes: Attribute[] = [
        {
            name: 'instanceId',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.PrimaryKey
        },
        {
            name: 'actionName',
            attrType: TypeRef.StringType,
            isKey: true,
            keyType: TypeRef.SecondaryKey
        }
    ];
    constructor(namePrefix = '', nameSuffix = '') {
        super(namePrefix, nameSuffix);
        // Caution: don't forget to set a correct name.
        this.setName('LifecycleItem');
        this.alterAttributes(LifecycleItem.__attributes);
        // NOTE: use AWS DynamoDB type refs
        this.alterAttributesUsingTypeReference(AwsTypeRefs);
    }
}
