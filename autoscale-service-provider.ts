export enum AutoscaleServiceType {
    SaveAutoscaleSettings = 'saveSettings',
    StartAutoscale = 'startAutoscale',
    StopAutoscale = 'stopAutoscale'
}
export interface AutoscaleServiceRequest {
    source: string;
    serviceType: string;
    [key: string]: string;
}

export interface AutoscaleServiceProvider<TReq, TRes> {
    handleServiceRequest(request: TReq): Promise<TRes>;
    startAutoscale(): Promise<boolean>;
    stopAutoscale(): Promise<boolean>;
    saveAutoscaleSettings(props: { [key: string]: string }): Promise<boolean>;
}
