import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { VirtualMachine } from '../../virtual-machine';
import { FortiAnalyzerConnector } from '../fortianalyzer-connector';
import {
    FazDeviceAuthorization,
    FazIntegrationStrategy
} from '../fortigate-faz-integration-strategy';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsLambdaInvocable } from './aws-lambda-invocable';
import { AwsPlatformAdapter } from './aws-platform-adapter';

export class AwsFazReactiveAuthorizationStrategy implements FazIntegrationStrategy {
    constructor(readonly platform: AwsPlatformAdapter, readonly proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    /**
     * create an authorization request for a FortiGate device. This process is run asynchronously.
     * this method is called as part of the high level Autoscale business logics.
     * @param {VirtualMachine} vm the vm to process FAZ authorization in a different Lambda function
     * instance.
     */
    async createAuthorizationRequest(vm: VirtualMachine): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.createAuthorizationRequest.');
        // TODO: require implementation
        const settings = await this.platform.getSettings();
        const settingFazIntegration = settings.get(
            AwsFortiGateAutoscaleSetting.EnableFazIntegration
        );
        const enableFazIntegration = settingFazIntegration && settingFazIntegration.truthValue;
        // ignore if not faz integration enabled
        if (!enableFazIntegration) {
            this.proxy.logAsInfo('FAZ integration not enabled.');
            this.proxy.logAsInfo(
                'called FazReactiveRegsitrationStrategy.createAuthorizationRequest.'
            );
            return;
        }
        const settingFazHandlerName = settings.get(
            AwsFortiGateAutoscaleSetting.FortiAnalyzerHandlerName
        );
        const handlerName = settingFazHandlerName && settingFazHandlerName.value;
        if (!handlerName) {
            throw new Error('Faz handler name not defined in settings.');
        }

        const payload: FazDeviceAuthorization = {
            vmId: (vm && vm.id) || undefined,
            privateIp: (vm && vm.primaryPrivateIpAddress) || undefined,
            publicIp: (vm && vm.primaryPublicIpAddress) || undefined
        };

        // invoke asynchronously to process this authorization request.
        // the target Lambda function will run the same strategy.
        await this.platform.invokeAutoscaleFunction(
            payload,
            handlerName,
            AwsLambdaInvocable.TriggerFazDeviceAuth
        );
        this.proxy.logAsInfo('called FazReactiveRegsitrationStrategy.createAuthorizationRequest.');
        return;
    }

    /**
     * Communicate with FortiAnalyzer to process the device authorizations.
     * This process is run asynchronously.
     * this method is called as part of the high level Autoscale business logics.
     * @param {FazDeviceAuthorization} device the information about the device to be registered
     * in the FAZ
     * @param {string} host FAZ public IP
     * @param {string} port FAZ port
     * @param {string} username Autoscale admin username for authorizations
     * @param {string} password Autoscale admin password for authorizations
     */
    async processAuthorizationRequest(
        device: FazDeviceAuthorization,
        host: string,
        port: string,
        username: string,
        password: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.processAuthorizationRequest');
        const fazConnector: FortiAnalyzerConnector = new FortiAnalyzerConnector(host, Number(port));
        const connected = await fazConnector.connect(username, password);
        if (!connected) {
            // if cannot connect to the faz, don't show error, but return immediately.
            this.proxy.logAsWarning('cannot connect to faz.');
            this.proxy.logAsInfo(
                'calling FazReactiveRegsitrationStrategy.processAuthorizationRequest'
            );
            return;
        }
        const devices = await fazConnector.listDevices();
        // TODO: is it possible to identify each device by ip address? so it can detect whether
        // the device is the one passed down for authorization in order to ensure that particular
        // device is authorized.
        await fazConnector.authorizeDevice(
            devices.filter(dev => {
                return dev && device && true; // in the future, may only filter the device.
            })
        );
        this.proxy.logAsInfo(
            `${(devices && devices.length) || '0'} devices in total have been authorized.`
        );
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.processAuthorizationRequest');
    }
}
