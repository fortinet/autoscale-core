export enum Tables {
    FORTIGATEAUTOSCALE = 'FORTIGATEAUTOSCALE',
    FORTIGATEMASTERELECTION = 'FORTIGATEMASTERELECTION',
    SETTINGS = 'SETTINGS',
    VMINFOCACHE = 'VMINFOCACHE',
    LIFECYCLEITEM = 'LIFECYCLEITEM',
    NICATTACHMENT = 'NICATTACHMENT',
    FORTIANALYZER = 'FORTIANALYZER',
    LICENSESTOCK = 'LICENSESTOCK',
    LICENSEUSAGE = 'LICENSEUSAGE',
    CUSTOMLOG = 'CUSTOMLOG',
    VPNATTACHMENT = 'VPNATTACHMENT',
}

export interface DbDef {
    [key: string]: TableDef
}

export interface AttributeDef {
    AttributeName: string
    AttributeType?: string
    KeyType?: string
}

export interface TableDef {
    TableName: string
    AttributeDefinitions: AttributeDef[]
    KeySchema: AttributeDef[]
    ProvisionedThroughput?: {
        ReadCapacityUnits: number
        WriteCapacityUnits: number
    }
    AdditionalAttributeDefinitions?: AttributeDef[]
}

const DB: DbDef = {
    LIFECYCLEITEM: {
        AttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'actionName',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'instanceId',
                KeyType: 'HASH',
            },
            {
                AttributeName: 'actionName',
                KeyType: 'RANGE',
            },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
        TableName: 'FortiGateLifecycleItem',
        AdditionalAttributeDefinitions: [],
    },
    FORTIGATEAUTOSCALE: {
        AttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'instanceId',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
        },
        TableName: 'FortiGateAutoscale',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'scalingGroupName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'heartBeatLossCount',
                AttributeType: 'N',
            },
            {
                AttributeName: 'heartBeatInterval',
                AttributeType: 'N',
            },
            {
                AttributeName: 'nextHeartBeatTime',
                AttributeType: 'N',
            },
            {
                AttributeName: 'masterIp',
                AttributeType: 'S',
            },
            {
                AttributeName: 'syncState',
                AttributeType: 'S',
            },
        ],
    },
    FORTIGATEMASTERELECTION: {
        AttributeDefinitions: [
            {
                AttributeName: 'scalingGroupName',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'scalingGroupName',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'FortiGateMasterElection',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'scalingGroupName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'ip',
                AttributeType: 'S',
            },
            {
                AttributeName: 'vpcId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'subnetId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'voteEndTime',
                AttributeType: 'N',
            },
            {
                AttributeName: 'voteState',
                AttributeType: 'S',
            },
        ],
    },
    FORTIANALYZER: {
        AttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'instanceId',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'FortiAnalyzer',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'serialNumber',
                AttributeType: 'S',
            },
            {
                AttributeName: 'ip',
                AttributeType: 'S',
            },
            {
                AttributeName: 'vip',
                AttributeType: 'S',
            },
            {
                AttributeName: 'master',
                AttributeType: 'BOOL',
            },
            {
                AttributeName: 'peers',
                AttributeType: 'S',
            },
        ],
    },
    SETTINGS: {
        AttributeDefinitions: [
            {
                AttributeName: 'settingKey',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'settingKey',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'Settings',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'settingValue',
                AttributeType: 'S',
            },
            {
                AttributeName: 'description',
                AttributeType: 'S',
            },
            {
                AttributeName: 'jsonEncoded',
                AttributeType: 'S',
            },
            {
                AttributeName: 'editable',
                AttributeType: 'S',
            },
        ],
    },
    NICATTACHMENT: {
        AttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'instanceId',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'NicAttachment',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'nicId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'attachmentState',
                AttributeType: 'S',
            },
        ],
    },
    VMINFOCACHE: {
        AttributeDefinitions: [
            {
                AttributeName: 'id',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'id',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'VmInfoCache',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'vmId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'scalingGroupName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'info',
                AttributeType: 'S',
            },
            {
                AttributeName: 'timestamp',
                AttributeType: 'N',
            },
            {
                AttributeName: 'expireTime',
                AttributeType: 'N',
            },
        ],
    },
    LICENSESTOCK: {
        AttributeDefinitions: [
            {
                AttributeName: 'checksum',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'checksum',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'LicenseStock',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'fileName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'algorithm',
                AttributeType: 'S',
            },
        ],
    },
    LICENSEUSAGE: {
        AttributeDefinitions: [
            {
                AttributeName: 'id',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'id',
                KeyType: 'HASH',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'LicenseUsage',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'id',
                AttributeType: 'S',
            },
            {
                AttributeName: 'checksum',
                AttributeType: 'S',
            },
            {
                AttributeName: 'fileName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'algorithm',
                AttributeType: 'S',
            },
            {
                AttributeName: 'scalingGroupName',
                AttributeType: 'S',
            },
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'assignedTime',
                AttributeType: 'N',
            },
            {
                AttributeName: 'blobKey',
                AttributeType: 'S',
            },
        ],
    },
    CUSTOMLOG: {
        AttributeDefinitions: [
            {
                AttributeName: 'id',
                AttributeType: 'S',
            },
            {
                AttributeName: 'timestamp',
                AttributeType: 'N',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'id',
                KeyType: 'HASH',
            },
            {
                AttributeName: 'timestamp',
                KeyType: 'RANGE',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'CustomLog',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'logContent',
                AttributeType: 'S',
            },
        ],
    },
    VPNATTACHMENT: {
        AttributeDefinitions: [
            {
                AttributeName: 'instanceId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'publicIp',
                AttributeType: 'S',
            },
        ],
        KeySchema: [
            {
                AttributeName: 'instanceId',
                KeyType: 'HASH',
            },
            {
                AttributeName: 'publicIp',
                KeyType: 'RANGE',
            },
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'VpnAttachment',
        AdditionalAttributeDefinitions: [
            {
                AttributeName: 'customerGatewayId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'vpnConnectionId',
                AttributeType: 'S',
            },
            {
                AttributeName: 'configuration',
                AttributeType: 'S',
            },
        ],
    },
}

export function getTables(namePrefix?: string, nameSuffix?: string, excludedKeys: string[] = null) {
    let tables: DbDef = {},
        prefix = () => {
            return namePrefix ? `${namePrefix}-` : ''
        },
        suffix = () => {
            return nameSuffix ? `-${nameSuffix}` : ''
        }

    Object.entries(DB).forEach(([tableKey, tableDef]) => {
        if (!(excludedKeys && excludedKeys.includes(tableKey))) {
            tableDef.TableName = prefix() + tableDef.TableName + suffix()
            tables[tableKey] = tableDef
        }
    })
    return tables
}
