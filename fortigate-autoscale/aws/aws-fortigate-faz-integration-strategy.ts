import { FortiAnalyzerConnector } from '../fortianalyzer-connector';
import { CloudFunctionProxyAdapter } from '../../cloud-function-proxy';
import { VirtualMachine } from '../../virtual-machine';
import {
    FazDeviceRegistration,
    FazIntegrationStrategy
} from '../fortigate-faz-integration-strategy';
import { AwsFortiGateAutoscaleSetting } from './aws-fortigate-autoscale-settings';
import { AwsLambdaInvocable } from './aws-lambda-invocable';
import { AwsPlatformAdapter } from './aws-platform-adapter';

export class AwsFazReactiveRegsitrationStrategy implements FazIntegrationStrategy {
    constructor(readonly platform: AwsPlatformAdapter, readonly proxy: CloudFunctionProxyAdapter) {
        this.platform = platform;
        this.proxy = proxy;
    }
    /**
     * start the FAZ device registration process. This process is run asynchronously.
     * this method is called as part of the high level Autoscale business logics.
     * @param {VirtualMachine} vm the vm to process FAZ registration in a different Lambda function
     * instance.
     */
    async registerDevice(vm: VirtualMachine): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.registerDevice.');
        // TODO: require implementation
        const settings = await this.platform.getSettings();
        const settingFazIntegration = settings.get(
            AwsFortiGateAutoscaleSetting.EnableFazIntegration
        );
        const enableFazIntegration = settingFazIntegration && settingFazIntegration.truthValue;
        // ignore if not faz integration enabled
        if (!enableFazIntegration) {
            this.proxy.logAsInfo('FAZ integration not enabled.');
            this.proxy.logAsInfo('called FazReactiveRegsitrationStrategy.registerDevice.');
            return;
        }
        const settingFazHandlerName = settings.get(
            AwsFortiGateAutoscaleSetting.FortiAnalyzerHandlerName
        );
        const handlerName = settingFazHandlerName && settingFazHandlerName.value;
        if (!handlerName) {
            throw new Error('Faz handler name not defined in settings.');
        }

        const payload: FazDeviceRegistration = {
            vmId: vm.id,
            privateIp: vm.primaryPrivateIpAddress,
            publicIp: vm.primaryPublicIpAddress
        };

        // invoke asynchronously to process this registration request.
        // the target Lambda function will run the same strategy.
        await this.platform.invokeAutoscaleFunction(
            {
                ...payload
            },
            handlerName,
            AwsLambdaInvocable.RegisterDeviceInFortiAnalyzer
        );
        this.proxy.logAsInfo('called FazReactiveRegsitrationStrategy.registerDevice.');
        return;
    }

    /**
     * Authorize a FortiGate device in FortiAnalyzer.
     * @param {FazDeviceRegistration} device the information about the device to be authorized
     * in the FAZ
     * @param {string} host FAZ public IP
     * @param {string} port FAZ port
     * @param {string} username Autoscale admin username for authorization
     * @param {string} password Autoscale admin password for authorization
     */
    async authorizeDevice(
        device: FazDeviceRegistration,
        host: string,
        port: string,
        username: string,
        password: string
    ): Promise<void> {
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.authorizeDevice');
        const fazConnector: FortiAnalyzerConnector = new FortiAnalyzerConnector(host, Number(port));
        const connected = await fazConnector.connect(username, password);
        if (!connected) {
            // if cannot connect to the faz, don't show error, but return immediately.
            this.proxy.logAsWarning('cannot connect to faz.');
            this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.authorizeDevice');
            return;
        }
        const devices = await fazConnector.listDevices();
        // TODO: is it possible to identify each device by ip address? so it can detect whether
        // the device is the one passed down for registration in order to ensure that particular
        // device is registered.
        await fazConnector.authorizeDevice(
            devices.filter(dev => {
                return dev && device && true; // in the future, may only filter the device.
            })
        );
        this.proxy.logAsInfo(
            `${(devices && devices.length) || '0'} devices in total have been authorized.`
        );
        this.proxy.logAsInfo('calling FazReactiveRegsitrationStrategy.authorizeDevice');
    }
}
