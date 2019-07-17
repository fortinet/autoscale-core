'use strict'

/*
A DynamoDB structure for Setting item: FortiAnalyzer.
Author: Fortinet
*/
import { SettingItem } from './setting-item'

export class FortiAnalyzerSettingItem extends SettingItem {
    constructor(
        public readonly instanceId: string,
        public readonly ip: string,
        public readonly vip: string
    ) {
        //TODO: key and descriptions are to be determined
        super(
            `${FortiAnalyzerSettingItem.SETTING_KEY}-${instanceId}`,
            JSON.stringify({
                instanceId: instanceId,
                ip: ip,
                vip: vip,
            }),
            false,
            true,
            ''
        )
    }

    static get SETTING_KEY() {
        return 'fortianalyzer'
    }

    /**
     * Return a DB entry
     * @returns {Object} object
     */
    toDb() {
        return {
            settingKey: FortiAnalyzerSettingItem.SETTING_KEY,
            settingValue: JSON.stringify({
                instanceId: this.instanceId,
                ip: this.ip,
                vip: this.vip,
            }),
        }
    }

    /**
     * Resucitate from a stored DB entry
     * @param entry Entry from DB
     * @returns {FortiAnalyzerSettingItem} A new faz setting item.
     */
    //TODO: use SettingItemLike instead of any for entry type
    static fromDb(entry: any) {
        let value: { [key: string]: string }
        if (
            !(
                entry.settingKey ||
                entry.settingKey.indexOf(FortiAnalyzerSettingItem.SETTING_KEY) >= 0
            )
        ) {
            throw new Error('Invalid entry setting key.')
        }
        try {
            value =
                (entry.jsonEncoded && JSON.parse(entry.settingValue as string)) ||
                entry.settingValue
        } catch (error) {
            throw new Error(`Invalid setting value: ${entry.settingValue}`)
        }
        if (!value.instanceId) {
            throw new Error('No instanceId found on setting value.')
        }
        return new FortiAnalyzerSettingItem(value.instanceId, value.ip, value.vip)
    }
}
