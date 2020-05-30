import path from 'path';

import { AutoscaleEnvironment } from './autoscale-environment';
import { AutoscaleSetting, Settings } from './autoscale-setting';
import { CloudFunctionProxy, CloudFunctionProxyAdapter, ReqMethod } from './cloud-function-proxy';
import {
    AutoscaleContext,
    HeartbeatSyncStrategy,
    MasterElectionStrategy,
    TaggingVmStrategy,
    VmTagging
} from './context-strategy/autoscale-context';
import {
    LicensingModelContext,
    LicensingStrategy,
    LicensingStrategyResult
} from './context-strategy/licensing-context';
import {
    ScalingGroupContext,
    ScalingGroupStrategy
} from './context-strategy/scaling-group-context';
import {
    HealthCheckResult,
    HealthCheckSyncState,
    MasterElection,
    MasterRecordVoteState
} from './master-election';
import { PlatformAdapter } from './platform-adapter';
import { VirtualMachine } from './virtual-machine';

export class HttpError extends Error {
    public readonly name: string;
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'HttpError';
    }
}

const reqMethod: Map<string, ReqMethod> = new Map([
    ['GET', ReqMethod.GET],
    ['POST', ReqMethod.POST],
    ['PUT', ReqMethod.PUT],
    ['DELETE', ReqMethod.DELETE],
    ['PATCH', ReqMethod.PATCH],
    ['HEAD', ReqMethod.HEAD],
    ['TRACE', ReqMethod.TRACE],
    ['OPTIONS', ReqMethod.OPTIONS],
    ['CONNECT', ReqMethod.CONNECT]
]);

export function mapHttpMethod(s: string): ReqMethod {
    return s && reqMethod.get(s.toUpperCase());
}

export interface PlatformAdaptee {
    loadSettings(): Promise<Settings>;
    // getReqType(proxy: CloudFunctionProxyAdapter): Promise<ReqType>;
    // getReqMethod(proxy: CloudFunctionProxyAdapter): ReqMethod;
    // checkReqIntegrity(proxy: CloudFunctionProxyAdapter): void;
    // getReqBody(proxy: CloudFunctionProxyAdapter): ReqBody;
    // getReqHeaders(proxy: CloudFunctionProxyAdapter): ReqHeaders;
}

/**
 * To provide Cloud Function handling logics
 */
export interface AutoscaleHandler<TReq, TContext, TRes> {
    handleAutoscaleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
    handleLicenseRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
}

export interface AutoscaleServiceProvider<TReq, TContext, TRes> {
    handleServiceRequest(proxy: CloudFunctionProxy<TReq, TContext, TRes>): Promise<TRes>;
    startAutoscale(): Promise<boolean>;
    stopAutoscale(): Promise<boolean>;
    SaveAutoscaleSettings(props: { [key: string]: string }): Promise<boolean>;
}

export interface AutoscaleCore
    extends AutoscaleContext,
        ScalingGroupContext,
        LicensingModelContext {
    init(): Promise<void>;
    saveSettings(settings: { [key: string]: string }): Promise<boolean>;
}

export interface HAActivePassiveBoostrapStrategy {
    prepare(
        election: MasterElection,
        platform: PlatformAdapter,
        proxy: CloudFunctionProxyAdapter
    ): Promise<void>;
    result(): Promise<MasterElection>;
}

export class Autoscale implements AutoscaleCore {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    settings: Settings;
    taggingAutoscaleVmStrategy: TaggingVmStrategy;
    scalingGroupStrategy: ScalingGroupStrategy;
    heartbeatSyncStrategy: HeartbeatSyncStrategy;
    masterElectionStrategy: MasterElectionStrategy;
    licensingStrategy: LicensingStrategy;
    constructor(p: PlatformAdapter, e: AutoscaleEnvironment, x: CloudFunctionProxyAdapter) {
        this.platform = p;
        this.env = e;
        this.proxy = x;
    }
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void {
        this.scalingGroupStrategy = strategy;
    }
    setMasterElectionStrategy(strategy: MasterElectionStrategy): void {
        this.masterElectionStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void {
        this.heartbeatSyncStrategy = strategy;
    }
    setTaggingAutoscaleVmStrategy(strategy: TaggingVmStrategy): void {
        this.taggingAutoscaleVmStrategy = strategy;
    }
    setLicensingStrategy(strategy: LicensingStrategy): void {
        this.licensingStrategy = strategy;
    }
    async init(): Promise<void> {
        await this.platform.init();
    }

    async handleLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchingVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onLaunchingVm();
        this.proxy.logAsInfo('called handleLaunchingVm.');
        return result;
    }
    async handleLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchedVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onLaunchedVm();
        this.proxy.logAsInfo('called handleLaunchedVm.');
        return result;
    }
    async handleTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatingVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        await this.scalingGroupStrategy.onTerminatingVm();
        // ASSERT: this.scalingGroupStrategy.onTerminatingVm() creates a terminating lifecycle item
        // in terminating vm, should do:
        // 1. mark it as heartbeat out-of-sync to prevent it from syncing again.
        // load target vm
        const targetVm = this.env.targetVm || (await this.platform.getTargetVm());
        this.heartbeatSyncStrategy.prepare(this.platform, this.proxy, targetVm);
        const success = await this.heartbeatSyncStrategy.forceOutOfSync();
        if (success) {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm.id
            );
        }
        // 2. if it is a master vm, remove its master tag
        if (this.platform.vmEquals(targetVm, this.env.masterVm)) {
            const vmTaggings: VmTagging[] = [
                {
                    vmId: targetVm.id,
                    clear: true
                }
            ];
            await this.handleTaggingAutoscaleVm(vmTaggings);
        }
        this.proxy.logAsInfo('called handleTerminatingVm.');
        return '';
    }
    async handleTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatedVm.');
        this.scalingGroupStrategy.prepare(this.platform, this.proxy);
        const result = await this.scalingGroupStrategy.onTerminatedVm();
        this.proxy.logAsInfo('called handleTerminatedVm.');
        return result;
    }
    async handleHeartbeatSync(): Promise<string> {
        this.proxy.logAsInfo('calling handleHeartbeatSync.');
        let response = '';
        let error: Error;
        const unhealthyVms: VirtualMachine[] = [];

        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            error = new Error(`Requested non-existing vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        // prepare to apply the heartbeatSyncStrategy to get vm health check records
        // ASSERT: this.env.targetVm is available
        this.heartbeatSyncStrategy.prepare(this.platform, this.proxy, this.env.targetVm);
        // apply the heartbeat sync strategy to be able to get vm health check records
        await this.heartbeatSyncStrategy.apply();
        // ASSERT: the heartbeatSyncStrategy is done

        // load target health check record
        if (this.heartbeatSyncStrategy.targetHealthCheckRecord.upToDate) {
            this.env.targetHealthCheckRecord = this.heartbeatSyncStrategy.targetHealthCheckRecord;
        }
        // if it's not up to date, load it from db.
        else {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm.id
            );
        }

        const isFirstHeartbeat = this.heartbeatSyncStrategy.targetVmFirstHeartbeat;

        // the 1st hb is also the indication of the the vm becoming in-service. The launching vm
        // phase (in some platforms) should be done at this point. apply the launced vm strategy
        if (isFirstHeartbeat) {
            this.scalingGroupStrategy.prepare(this.platform, this.proxy);
            await this.scalingGroupStrategy.onLaunchedVm();
        }

        const heartbeatTiming = await this.heartbeatSyncStrategy.healthCheckResult;
        // If the timing indicates that it should be dropped,
        // don't update. Respond immediately. return.
        if (heartbeatTiming === HealthCheckResult.Dropped) {
            return '';
        }

        // if master exists?
        // get master vm
        this.env.masterVm = this.env.masterVm || (await this.platform.getMasterVm());

        // get master healthcheck record
        if (this.env.masterVm) {
            this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.masterVm.id
            );
        } else {
            this.env.masterHealthCheckRecord = undefined;
        }
        // get master record
        this.env.masterRecord = this.env.masterRecord || (await this.platform.getMasterRecord());

        // about to handle to the master election

        // NOTE: master election relies on health check record of both target and master vm,
        // ensure the two values are up to date.

        // ASSERT: the following values are up-to-date before handling master election.
        // this.env.targetVm
        // this.env.masterVm
        // this.env.masterRecord

        const masterElection = await this.handleMasterElection();

        // handle unhealthy vm

        // target not healthy?

        // if new master is elected, reload the masterVm, master record to this.env.
        if (masterElection.newMaster) {
            this.env.masterVm = masterElection.newMaster;
            this.env.masterRecord = masterElection.newMasterRecord;
            this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.masterVm.id
            );

            // what to do with the old master?

            // old master unhealthy?
            const oldMasterHealthCheck =
                masterElection.oldMaster &&
                (await this.platform.getHealthCheckRecord(masterElection.oldMaster.id));
            if (oldMasterHealthCheck && !oldMasterHealthCheck.healthy) {
                if (
                    unhealthyVms.filter(vm => {
                        return this.platform.vmEquals(vm, masterElection.oldMaster);
                    }).length === 0
                ) {
                    unhealthyVms.push(masterElection.oldMaster);
                }
            }
        }

        // ASSERT: target healthcheck record is up to date
        if (!this.env.targetHealthCheckRecord.healthy) {
            if (
                unhealthyVms.filter(vm => {
                    return this.platform.vmEquals(vm, this.env.targetVm);
                }).length === 0
            ) {
                unhealthyVms.push(this.env.targetVm);
            }
        }

        await this.handleUnhealthyVm(unhealthyVms);

        // if target is unhealthy, respond immediately as if the heartbeat sync normally completed.
        if (!this.env.targetHealthCheckRecord.healthy) {
            this.proxy.logAsInfo('called handleHeartbeatSync.');
            return response;
        }

        // the health check record may need to update again.
        let needToUpdateHealthCheckRecord = false;
        let updatedMasterIp: string;

        // if there's a new master elected, and the new master ip doesn't match the master ip of
        // the target, assign the new master to the target
        if (
            masterElection.newMaster &&
            this.env.targetHealthCheckRecord.masterIp !==
                masterElection.newMaster.primaryPrivateIpAddress
        ) {
            needToUpdateHealthCheckRecord = true;
            updatedMasterIp = masterElection.newMaster.primaryPrivateIpAddress;
        }
        // if there's an old master, and it's in healthy state, and the target vm doesn't have
        // an assigned master ip, or the master ip is different, assign the old healthy master to it
        else if (
            masterElection.oldMaster &&
            this.env.masterVm &&
            this.env.masterHealthCheckRecord &&
            masterElection.oldMaster.id === this.env.masterVm.id &&
            this.env.masterHealthCheckRecord.healthy &&
            this.env.targetHealthCheckRecord.masterIp !==
                masterElection.oldMaster.primaryPrivateIpAddress
        ) {
            needToUpdateHealthCheckRecord = true;
            updatedMasterIp = masterElection.oldMaster.primaryPrivateIpAddress;
        }

        if (needToUpdateHealthCheckRecord) {
            this.env.targetHealthCheckRecord.masterIp = updatedMasterIp;
            await this.platform.updateHealthCheckRecord(this.env.targetHealthCheckRecord);
            response = JSON.stringify({
                'master-ip': updatedMasterIp
            });
        }
        this.proxy.logAsInfo('called handleHeartbeatSync.');
        return response;
    }
    async handleTaggingAutoscaleVm(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling handleTaggingAutoscaleVm.');
        this.taggingAutoscaleVmStrategy.prepare(this.platform, this.proxy, taggings);
        await this.taggingAutoscaleVmStrategy.apply();
        this.proxy.logAsInfo('called handleTaggingAutoscaleVm.');
    }

    async handleMasterElection(): Promise<MasterElection> {
        this.proxy.logAsInfo('calling handleMasterElection.');
        const settings = await this.platform.getSettings();
        const electionTimeout = Number(settings.get(AutoscaleSetting.MasterElectionTimeout).value);
        let election: MasterElection = {
            oldMaster: this.env.masterVm,
            oldMasterRecord: this.env.masterRecord,
            newMaster: null,
            newMasterRecord: null,
            candidate: this.env.targetVm,
            electionDuration: electionTimeout,
            signature: null
        };
        await this.masterElectionStrategy.prepare(election, this.platform, this.proxy);

        // master election required? condition 1: no master vm or record
        if (!this.env.masterRecord || !this.env.masterVm) {
            // handleMasterElection() will update the master vm info, if cannot determine the
            // master vm, master vm info will be set to null
            // expect that the pending master vm info can be available
            await this.masterElectionStrategy.apply();
            // after master election complete (election may not be necessary in some cases)
            // get the election result.
            election = await this.masterElectionStrategy.result();
        }
        // master election required? condition 2: has master record, but it's pending
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Pending) {
            // if master election is pending, only need to know the current result. do not need
            // to redo the election.
            // but if the target is also the pending master, the master election need to complete
            if (this.platform.vmEquals(this.env.targetVm, this.env.masterVm)) {
                // only complete the election when the pending master is healthy and still in-sync
                if (
                    this.env.targetHealthCheckRecord &&
                    this.env.targetHealthCheckRecord.healthy &&
                    this.env.targetHealthCheckRecord.syncState === HealthCheckSyncState.InSync
                ) {
                    this.env.masterRecord.voteState = MasterRecordVoteState.Done;
                    election.newMaster = this.env.targetVm;
                    election.newMasterRecord = this.env.masterRecord;
                    await this.platform.updateMasterRecord(this.env.masterRecord);
                }
                // otherwise, do nothing
            }
            // otherwise, do nothing
        }
        // master election required? condition 3: has master record, but it's timeout
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Timeout) {
            // if master election already timeout, clear the current master vm and record
            // handleMasterElection() will update the master vm info, if cannot determine the
            // master vm, master vm info will be set to null
            // expect that a different master will be elected and its vm info can be available
            this.env.masterRecord = null;
            this.env.masterVm = null;
            await this.masterElectionStrategy.apply();
            // after master election complete (election may not be necessary in some cases)
            // get the election result.
            election = await this.masterElectionStrategy.result();
        }
        // master election required? condition 4: has master record, it's done
        else if (this.env.masterRecord.voteState === MasterRecordVoteState.Done) {
            // how is the master health check in this case?
            // get master vm healthcheck record
            if (!this.env.masterHealthCheckRecord) {
                this.env.masterHealthCheckRecord = await this.platform.getHealthCheckRecord(
                    this.env.masterVm.id
                );
            }
            // master is unhealthy, master election required. if target is the master, don't do election.
            if (
                !this.env.masterHealthCheckRecord.healthy &&
                !this.platform.vmEquals(this.env.targetVm, this.env.masterVm)
            ) {
                // handleMasterElection() will update the master vm info, if cannot determine the
                // master vm, master vm info will be set to null
                // expect that a different master will be elected and its vm info can be available
                await this.masterElectionStrategy.apply();
                // after master election complete (election may not be necessary in some cases)
                // get the election result.
                election = await this.masterElectionStrategy.result();
            }
        }

        this.proxy.logAsInfo('called handleMasterElection.');
        return election;
    }
    async handleUnhealthyVm(vms: VirtualMachine[]): Promise<void> {
        this.proxy.logAsInfo('calling handleUnhealthyVm.');
        // call the platform scaling group to terminate the vm in the list
        await Promise.all(
            vms.map(vm => {
                this.proxy.logAsInfo(`handling unhealthy vm(id: ${vm.id})...`);
                return this.platform
                    .deleteVmFromScalingGroup(vm.id)
                    .then(() => {
                        this.proxy.logAsInfo(`handling vm (id: ${vm.id}) completed.`);
                    })
                    .catch(err => {
                        this.proxy.logForError('handling unhealthy vm failed.', err);
                    });
            })
        );
        this.proxy.logAsInfo('called handleUnhealthyVm.');
    }
    async handleLicenseAssignment(productName: string): Promise<string> {
        this.proxy.logAsInfo('calling handleLicenseAssignment.');
        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            const error = new Error(`Requested non-existing vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        const settings = await this.platform.getSettings();
        let assetStorageDir = settings.get(AutoscaleSetting.CustomAssetContainer).value;
        // assume to use the custom asset container as the storage directory for license files.
        // if such container isn't set, use the asset storage directory of the deployment stack.
        if (!assetStorageDir) {
            assetStorageDir = settings.get(AutoscaleSetting.AssetStorageDirectory).value;
        }
        const licenseDir: string = path.join(
            assetStorageDir,
            settings.get(AutoscaleSetting.LicenseFileDirectory).value,
            productName
        );
        this.licensingStrategy.prepare(
            this.platform,
            this.proxy,
            this.env.targetVm,
            productName,
            settings.get(AutoscaleSetting.AssetStorageContainer).value,
            licenseDir
        );
        let result: LicensingStrategyResult;
        let licenseContent = '';
        try {
            result = await this.licensingStrategy.apply();
        } catch (e) {
            this.proxy.logForError('Error in running licensing strategy.', e);
        }
        if (result === LicensingStrategyResult.LicenseAssigned) {
            licenseContent = await this.licensingStrategy.getLicenseContent();
        } else if (result === LicensingStrategyResult.LicenseNotRequired) {
            this.proxy.logAsInfo(
                `license isn't required for this vm (id: ${this.env.targetVm.id})`
            );
        } else if (result === LicensingStrategyResult.LicenseOutOfStock) {
            this.proxy.logAsError(
                'License out of stock. ' +
                    `No license is assigned to this vm (id: ${this.env.targetVm.id})`
            );
        }
        this.proxy.logAsInfo('called handleLicenseAssignment.');
        return licenseContent;
    }

    async saveSettings(settings: { [key: string]: string }): Promise<boolean> {
        const tasks = [];
        const errorTasks = [];
        // eslint-disable-next-line prefer-const
        for (let [key, value] of Object.entries(settings)) {
            let keyName: string;
            let description: string;
            let jsonEncoded: boolean;
            let editable: boolean;
            switch (key.toLowerCase()) {
                case 'servicetype':
                    // ignore service type
                    break;
                case 'deploymentsettingssaved':
                    keyName = 'deployment-settings-saved';
                    description =
                        'A flag setting item that indicates all deployment ' +
                        'settings have been saved.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'byolscalinggroupdesiredcapacity':
                    keyName = 'byol-scaling-group-desired-capacity';
                    description = 'BYOL Scaling group desired capacity.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'byolscalinggroupminsize':
                    keyName = 'byol-scaling-group-min-size';
                    description = 'BYOL Scaling group min size.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'byolscalinggroupmaxsize':
                    keyName = 'byol-scaling-group-max-size';
                    description = 'BYOL Scaling group max size.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'scalinggroupdesiredcapacity':
                    keyName = 'scaling-group-desired-capacity';
                    description = 'PAYG Scaling group desired capacity.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'scalinggroupminsize':
                    keyName = 'scaling-group-min-size';
                    description = 'PAYG Scaling group min size.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'scalinggroupmaxsize':
                    keyName = 'scaling-group-max-size';
                    description = 'PAYG Scaling group max size.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'resourcetagprefix':
                    keyName = 'resource-tag-prefix';
                    description = 'Resource tag prefix.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'customidentifier':
                    keyName = 'custom-id';
                    description = 'Custom Identifier.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'uniqueid':
                    keyName = 'unique-id';
                    description = 'Unique ID.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'assetstoragename':
                    keyName = 'asset-storage-name';
                    description = 'Asset storage name.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'assetstoragekeyprefix':
                    keyName = 'asset-storage-key-prefix';
                    description = 'Asset storage key prefix.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateautoscalevirtualnetworkid':
                    keyName = 'fortigate-autoscale-virtual-network-id';
                    description = 'Virtual Network ID of the FortiGate Autoscale.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateautoscalesubnetidlist':
                    keyName = 'fortigate-autoscale-subnet-id-list';
                    description =
                        'The list of ID of the subnet of the FortiGate Autoscale. Comma separated.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateautoscalesubnetpairs':
                    keyName = 'fortigate-autoscale-subnet-pairs';
                    description =
                        'The list of the pairing of one fortigate subnet with an array of' +
                        ' multiple dependent subnets';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigatepsksecret':
                    keyName = 'fortigate-psk-secret';
                    description = 'The PSK for FortiGate Autoscale Synchronization.';
                    break;
                case 'fortigateadminport':
                    keyName = 'fortigate-admin-port';
                    description = 'The port number for administrative login to FortiGate.';
                    break;
                case 'fortigatetrafficport':
                    keyName = 'fortigate-traffic-port';
                    description =
                        'The port number for load balancer to route traffic through ' +
                        'FortiGate to the protected services behind the load balancer.';
                    break;
                case 'fortigatesyncinterface':
                    keyName = 'fortigate-sync-interface';
                    description =
                        'The interface the FortiGate uses for configuration ' + 'synchronization.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'lifecyclehooktimeout':
                    keyName = 'lifecycle-hook-timeout';
                    description = 'The auto scaling group lifecycle hook timeout time in second.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'heartbeatinterval':
                    keyName = 'heartbeat-interval';
                    description = 'The FortiGate sync heartbeat interval in second.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'masterelectiontimeout':
                    keyName = 'master-election-timeout';
                    description = 'The FortiGate master election timtout time in second.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'masterelectionnowait':
                    keyName = 'master-election-no-wait';
                    description =
                        'Do not wait for the new master to come up. This FortiGate ' +
                        'can receive the new master ip in one of its following heartbeat sync.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'heartbeatlosscount':
                    keyName = 'heartbeat-loss-count';
                    description = 'The FortiGate sync heartbeat loss count.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'heartbeatdelayallowance':
                    keyName = 'heartbeat-delay-allowance';
                    description = 'The FortiGate sync heartbeat delay allowance time in second.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'autoscalehandlerurl':
                    keyName = 'autoscale-handler-url';
                    description = 'The FortiGate Autoscale handler URL.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'masterscalinggroupname':
                    keyName = 'master-scaling-group-name';
                    description = 'The name of the master auto scaling group.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'paygscalinggroupname':
                    keyName = 'payg-scaling-group-name';
                    description = 'The name of the PAYG auto scaling group.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'byolscalinggroupname':
                    keyName = 'byol-scaling-group-name';
                    description = 'The name of the BYOL auto scaling group.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'requiredconfigset':
                    keyName = 'required-configset';
                    description = 'A comma-delimited list of required configsets.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'requireddbtable':
                    keyName = 'required-db-table';
                    description = 'A comma-delimited list of required DB table names.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'transitgatewayid':
                    keyName = 'transit-gateway-id';
                    description =
                        'The ID of the Transit Gateway the FortiGate Autoscale is ' +
                        'attached to.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enabletransitgatewayvpn':
                    keyName = 'enable-transit-gateway-vpn';
                    value = value && value !== 'false' ? 'true' : 'false';
                    description =
                        'Toggle ON / OFF the Transit Gateway VPN creation on each ' +
                        'FortiGate instance';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enablesecondnic':
                    keyName = 'enable-second-nic';
                    value = value && value !== 'false' ? 'true' : 'false';
                    description =
                        'Toggle ON / OFF the secondary eni creation on each ' +
                        'FortiGate instance';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'vpnbgpasn':
                    keyName = 'vpn-bgp-asn';
                    description = 'The BGP Autonomous System Number used with the VPN connections.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'transitgatewayvpnhandlername':
                    keyName = 'transit-gateway-vpn-handler-name';
                    description = 'The Transit Gateway VPN handler function name.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'transitgatewayroutetableinbound':
                    keyName = 'transit-gateway-route-table-inbound';
                    description = 'The Id of the Transit Gateway inbound route table.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'transitgatewayroutetableoutbound':
                    keyName = 'transit-gateway-route-table-outbound';
                    description = 'The Id of the Transit Gateway outbound route table.';
                    break;
                case 'enablehybridlicensing':
                    keyName = 'enable-hybrid-licensing';
                    description = 'Toggle ON / OFF the hybrid licensing feature.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enablefortigateelb':
                    keyName = 'enable-fortigate-elb';
                    description =
                        'Toggle ON / OFF the elastic load balancing for the FortiGate ' +
                        'scaling groups.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enableinternalelb':
                    keyName = 'enable-internal-elb';
                    description =
                        'Toggle ON / OFF the internal elastic load balancing for ' +
                        'the protected services by FortiGate.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateautoscaleelbdns':
                    keyName = 'fortigate-autoscale-elb-dns';
                    description =
                        'The DNS name of the elastic load balancer for the FortiGate ' +
                        'scaling groups.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateautoscaletargetgrouparn':
                    keyName = 'fortigate-autoscale-target-group-arn';
                    description =
                        'The ARN of the target group for FortiGate to receive ' +
                        'load balanced traffic.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigateprotectedinternalelbdns':
                    keyName = 'fortigate-protected-internal-elb-dns';
                    description =
                        'The DNS name of the elastic load balancer for the scaling ' +
                        'groups of services protected by FortiGate';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enablevminfocache':
                    keyName = 'enable-vm-info-cache';
                    description =
                        'Toggle ON / OFF the vm info cache feature. It caches the ' +
                        'vm info in db to reduce API calls to query a vm from the platform.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'vminfocachetime':
                    keyName = 'vm-info-cache-time';
                    description = 'The vm info cache time in seconds.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fortigatelicensestoragekeyprefix':
                    keyName = 'fortigate-license-storage-key-prefix';
                    description = 'The key prefix for FortiGate licenses in the access storage.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'getlicensegraceperiod':
                    keyName = 'get-license-grace-period';
                    description =
                        'The period (time in seconds) for preventing a newly assigned ' +
                        ' license to be recycled.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enablefortianalyzerintegration':
                    keyName = 'enable-fortianalyzer-integration';
                    description =
                        'Enable FortiAnalyzer integration with the FortiGates cluster ' +
                        'in the Autoscale.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'fazhandlername':
                    keyName = 'faz-handler-name';
                    description = 'The FortiGate Autoscale - FortiAnalyzer handler function name.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'enableintegratedegressnatgateway':
                    keyName = 'enable-integrated-egress-nat-gateway';
                    description =
                        'Toggle ON / OFF the feature for using master FortiGate in' +
                        ' the scaling group as the NAT gateway for egress traffic from protected' +
                        ' private subnets.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'egresstrafficroutetable':
                    keyName = 'egress-traffic-route-table';
                    description =
                        'The route table associated with the protected private subnets,' +
                        ' which should bet configured to contain a route 0.0.0.0/0 to the' +
                        ' master fortigate to handle egress traffic.';
                    editable = false;
                    jsonEncoded = false;
                    break;
                case 'subnetpair':
                    keyName = 'subnet-pair';
                    description =
                        'A list of paired subnet for the north-south traffic routing purposes.' +
                        ' Format: [{subnetId:name, pairId:name}, ...]';
                    editable = false;
                    jsonEncoded = true;
                    break;
                case 'licensefiledirectory':
                    keyName = 'license-file-directory';
                    description =
                        'The sub directory for storing license files under the asset container.';
                    editable = true;
                    jsonEncoded = false;
                    break;
                case 'additionalconfigsetnamelist':
                    keyName = 'additional-configset-name-list';
                    description =
                        'The comma-separated list of the name of a configset. These configsets' +
                        ' are required dependencies for the Autoscale to work for a certain ' +
                        ' deployment. Can be left empty.';
                    editable = true;
                    jsonEncoded = false;
                    break;
                case 'customassetcontainer':
                    keyName = 'custom-asset-container';
                    description =
                        'The asset storage name for some user custom resources, such as:' +
                        ' custom configset, license files, etc.';
                    editable = true;
                    jsonEncoded = false;
                    break;
                case 'customassetdirectory':
                    keyName = 'custom-asset-directory';
                    description =
                        'The sub directory to the user custom resources under the' +
                        ' custom-asset-container.';
                    editable = true;
                    jsonEncoded = false;
                    break;
                default:
                    break;
            }
            if (keyName) {
                tasks.push(
                    this.platform
                        .saveSettingItem(keyName, value, description, jsonEncoded, editable)
                        .catch(error => {
                            this.proxy.logForError(
                                `failed to save setting for key: ${keyName}. `,
                                error
                            );
                            errorTasks.push({ key: keyName, value: value });
                        })
                );
            }
        }
        await Promise.all(tasks);
        return errorTasks.length === 0;
    }
}

type FinderRef = { [key: string]: FinderRef } | [] | string | null;
export function configSetResourceFinder(resObject: FinderRef, nodePath: string): FinderRef {
    const [, mPath] = nodePath.match(/^{(.+)}$/i);
    if (!resObject || !nodePath) {
        return '';
    }
    const nodes = mPath.split('.');
    let ref = resObject;

    nodes.find(nodeName => {
        const matches = nodeName.match(/^([A-Za-z_@-]+)#([0-9])+$/i);
        if (matches && Array.isArray(ref[matches[1]]) && ref[matches[1]].length > matches[2]) {
            ref = ref[matches[1]][matches[2]];
        } else if (!ref[nodeName]) {
            ref = null;
            return null;
        } else {
            ref =
                Array.isArray(ref[nodeName]) && ref[nodeName].length > 0
                    ? ref[nodeName][0]
                    : ref[nodeName];
        }
    });
    return ref;
}
