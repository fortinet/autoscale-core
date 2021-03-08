import { VpnAttachmentContext } from './index';

/**
 * To provide AWS Transit Gateway integration related logics
 */
export type TransitGatewayContext = VpnAttachmentContext;
/**
 * created based on aws ec2 TransitGatewayPropagationState
 */
export enum AwsTgwVpnPropagationState {
    Enabled = 'enabled',
    Enabling = 'enabling',
    Disabled = 'disabled',
    Disabling = 'disabling'
}

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
