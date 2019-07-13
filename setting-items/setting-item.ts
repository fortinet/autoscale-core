export interface SettingItemInterface {
    settingKey: string
    settingValue: string | {}
    editable: boolean
    jsonEncoded: boolean
    description: string
}

export class SettingItem implements SettingItemInterface {
    constructor(
        public settingKey: string,
        public settingValue: string | {},
        public editable: boolean,
        public jsonEncoded: boolean,
        public description: string
    ) {}

    toString(): string {
        if (this.jsonEncoded && typeof this.settingValue === 'object') {
            return JSON.stringify(this.settingValue as object)
        } else {
            return this.settingValue as string
        }
    }
}
