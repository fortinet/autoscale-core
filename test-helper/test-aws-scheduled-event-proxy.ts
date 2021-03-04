import { AwsScheduledEventProxy, LogLevel } from '../fortigate-autoscale/aws';
export class TestAwsScheduledEventProxy extends AwsScheduledEventProxy {
    log(message: string, level: LogLevel): void {
        if (process.env.DEBUG_SHOW_LOG === 'true') {
            switch (level) {
                case LogLevel.Debug:
                    console.debug(message);
                    break;
                case LogLevel.Error:
                    console.error(message);
                    break;
                case LogLevel.Info:
                    console.info(message);
                    break;
                case LogLevel.Warn:
                    console.warn(message);
                    break;
                default:
                    console.log(message);
            }
        }
    }
}
