import { VpnAttachmentContext } from '..';

/**
 * To provide AWS Transit Gateway integration related logics
 */
export type TransitGatewayContext = VpnAttachmentContext;
/**
 * created based on aws ec2 TransitGatewayPropagationState
 */
// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum AwsTgwVpnPropagationState {
    Enabled = 'enabled',
    Enabling = 'enabling',
    Disabled = 'disabled',
    Disabling = 'disabling'
}

// the no-shadow rule errored in the next line may be just a false alarm
// eslint-disable-next-line no-shadow
export enum AwsVpnAttachmentState {
    Available = 'available',
    Deleting = 'deleting',
    Failed = 'failed',
    Failing = 'failing',
    Initiating = 'initiating',
    Modifying = 'modifying',
    PendingAcceptance = 'pendingAcceptance',
    RollingBack = 'rollingBack',
    Pending = 'pending',
    Rejected = 'rejected',
    Rejecting = 'rejecting'
}

export interface AwsCustomerGateway {
    id: string;
    type: string;
}

export interface AwsVpnConnection {
    vmId: string;
    ip: string;
    vpnConnectionId: string;
    customerGatewayId: string;
    transitGatewayId?: string;
    transitGatewayAttachmentId?: string;
}

export interface AwsTgwVpnUpdateAttachmentRouteTableRequest {
    attachmentId: string;
}
