import { AutoscaleEnvironment } from '../../autoscale-environment';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { FortiGateBootstrapConfigStrategy } from '../fortigate-bootstrap-config-strategy';
import { AzurePlatformAdapter } from './azure-platform-adapter';

export class AzureFortiGateBootstrapStrategy extends FortiGateBootstrapConfigStrategy {
    constructor(
        readonly platform: AzurePlatformAdapter,
        readonly proxy: CloudFunctionProxyAdapter,
        readonly env: AutoscaleEnvironment
    ) {
        super();
    }
}
