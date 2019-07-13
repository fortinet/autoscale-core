export interface VirtualNetworkLike {
    virtualNetworkId: string
}

export interface SubnetLike {
    virtualNetworkId: string
    subnetId: string
}

export abstract class VirtualNetwork<SourceType> implements SubnetLike {
    constructor(readonly sourcePlatform: string, readonly sourceData: SourceType) {}
    abstract get virtualNetworkId(): string
    abstract get subnetId(): string
}

export abstract class Subnet<SourceType> implements SubnetLike {
    constructor(readonly sourcePlatform: string, readonly sourceData: SourceType) {}
    abstract get virtualNetworkId(): string
    abstract get subnetId(): string
}
