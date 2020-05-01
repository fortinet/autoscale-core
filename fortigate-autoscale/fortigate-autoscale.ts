import * as HttpStatusCodes from 'http-status-codes';

import { Autoscale, CloudFunctionHandler, HttpError } from '../autoscale-core';
import { AutoscaleEnvironment } from '../autoscale-environment';
import { CloudFunctionProxy, ReqType } from '../cloud-function-proxy';
import {
    BootstrapConfigurationStrategy,
    BootstrapContext
} from '../context-strategy/bootstrap-context';
import { LicensingModelContext } from '../context-strategy/licensing-context';
import { PlatformAdapter } from '../platform-adapter';
import { VmTagging } from '../context-strategy/autoscale-context';

/**
 * FortiGate class with capabilities:
 * cloud function handling,
 * bootstrap configuration,
 * secondary nic attachment
 */
export abstract class FortiGateAutoscale<TReq, TContext, TRes> extends Autoscale
    implements CloudFunctionHandler<TReq, TContext, TRes>, BootstrapContext, LicensingModelContext {
    bootstrapConfigStrategy: BootstrapConfigurationStrategy;
    async handleCloudFunctionRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes> {
        let responseBody: string;
        try {
            this.proxy = proxy;
            this.platform = platform;
            this.env = env;
            this.proxy.logAsInfo('calling handleRequest.');
            this.proxy.logAsInfo('request integrity check.');
            // TODO: check whether all necessary request information are all there or not using
            // the platform checkRequestIntegrity() method. temporarily disable this checking from
            // the next line for now.
            // await this.platform.checkRequestIntegrity();

            // init the platform. this step is important
            await this.platform.init();
            const requestType = await this.platform.getRequestType();
            if (requestType === ReqType.LaunchingVm) {
                responseBody = await this.handleLaunchingVm();
            } else if (requestType === ReqType.BootstrapConfig) {
                responseBody = await this.handleBootstrap();
            } else if (requestType === ReqType.HeartbeatSync) {
                responseBody = await this.handleHeartbeatSync();
            } else if (requestType === ReqType.StatusMessage) {
                // NOTE: FortiGate sends status message on some internal conditions, could ignore
                // those status messages for now.
                this.proxy.logAsInfo('FortiGate status message is received but ignored.');
                responseBody = '';
            } else if (requestType === ReqType.TerminatingVm) {
                responseBody = await this.handleTerminatingVm();
            }
            this.proxy.logAsInfo('called handleRequest.');
            return proxy.formatResponse(HttpStatusCodes.OK, responseBody, {});
        } catch (error) {
            // ASSERT: error is always an instance of Error
            let httpError: HttpError;
            this.proxy.logForError('called handleRequest.', error);
            if (!(error instanceof HttpError)) {
                httpError = new HttpError(
                    HttpStatusCodes.INTERNAL_SERVER_ERROR,
                    (error as Error).message
                );
            } else {
                httpError = error;
            }
            return proxy.formatResponse(httpError.status, '', {});
        }
    }
    setBootstrapConfigurationStrategy(strategy: BootstrapConfigurationStrategy): void {
        this.bootstrapConfigStrategy = strategy;
    }
    async handleBootstrap(): Promise<string> {
        this.proxy.logAsInfo('calling handleBootstrap.');
        let error: Error;
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
        // load target healthcheck record
        this.env.targetHealthCheckRecord =
            this.env.targetHealthCheckRecord ||
            (await this.platform.getHealthCheckRecord(this.env.targetVm.id));

        // if there exists a health check record for this vm, this request may probably be
        // a duplicate request. ignore it.
        if (this.env.targetHealthCheckRecord) {
            this.proxy.logAsWarning(
                `Health check record for vm (id: ${this.env.targetVm.id}) ` +
                    'already exists. It looks like this bootstrap configuration request' +
                    " isn't normal. ignore it by returning empty."
            );
            this.proxy.logAsInfo('called handleBootstrap.');
            return '';
        }
        // if master is elected?
        // get master vm
        if (!this.env.masterVm) {
            this.env.masterVm = await this.platform.getMasterVm();
        }
        // get master record
        this.env.masterRecord = this.env.masterRecord || (await this.platform.getMasterRecord());
        // handle master election. the expected result should be one of:
        // master election is triggered
        // master election is finalized
        // master election isn't needed
        const masterElection = await this.handleMasterElection();

        // assert master record should be available now
        // get master record again
        this.env.masterVm = masterElection.newMaster || masterElection.oldMaster;
        this.env.masterRecord = masterElection.newMasterRecord || masterElection.oldMasterRecord;

        // tag the new vm
        const vmTagging: VmTagging = {
            vmId: this.env.targetVm.id,
            newVm: true, // ASSERT: vm in boostraping is a new vm
            newMasterRole:
                (masterElection.newMaster &&
                    this.platform.vmEqualTo(this.env.targetVm, this.env.masterVm)) ||
                false
        };
        await this.handleTaggingAutoscaleVm([vmTagging]);

        // get the bootstrap configuration
        await this.bootstrapConfigStrategy.prepare(this.platform, this.proxy, this.env);
        await this.bootstrapConfigStrategy.apply();
        const bootstrapConfig = this.bootstrapConfigStrategy.getConfiguration();
        // output configuration content in debug level so that we can turn it off on production
        this.proxy.logAsDebug(`configuration: ${bootstrapConfig}`);
        this.proxy.logAsInfo('called handleBootstrap.');
        return bootstrapConfig;
    }
}
