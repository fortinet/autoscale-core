'use strict'

/*
Author: Fortinet
*
* Contains all the relevant information needed to complete lifecycle actions for a given
* FortiGate instance, as well as info needed to clean up the related database entry.
*/

export enum LifecycleAction {
    ACTION_NAME_LAUNCHING_INSTANCE = 'launching',
    ACTION_NAME_TERMINATING_INSTANCE = 'terminating',
    ACTION_NAME_GET_CONFIG = 'getconfig',
    ACTION_NAME_ATTACH_NIC2 = 'attachnic2',
    UNKNOWN_ACTION = 'unknown',
}

export interface LifecycleItemLike {
    readonly instanceId: string
    readonly detail: {}
    actionName: LifecycleAction
    done: boolean
    readonly timestamp?: Date
}

export class LifecycleItem implements LifecycleItemLike {
    /**
     * @param instanceId Id of the FortiGate instance.
     * @param detail Opaque information used by the platform to manage this item.
     * @param actionName Optional name for this record to lookup. should be one in
     * ['syncconfig', 'attachnic']
     * @param done whether this lifecyclehook action is done or not
     * @param timestamp Optional timestamp for this record.
     */
    constructor(
        readonly instanceId: string,
        readonly detail: {},
        public actionName: LifecycleAction = LifecycleAction.UNKNOWN_ACTION,
        public done: boolean = false,
        public readonly timestamp?: Date
    ) {}

    /**
     * @returns {LifecycleItemInterface} object {FortigateInstance, Timestamp, Detail}
     */

    likeify() {
        return <LifecycleItemLike>{
            instanceId: this.instanceId,
            actionName: this.actionName,
            timestamp: this.timestamp,
            detail: this.detail,
            done: this.done,
        }
    }

    /**
     * Resucitate from a stored DB entry
     * @param entry Entry from DB
     * @returns A new lifecycle item.
     */
    static fromDb(entry: LifecycleItemLike) {
        const date = (entry.timestamp && new Date(entry.timestamp)) || null
        if (date && !date.getTime()) {
            throw new Error(
                `Cannot convert timestamp to type Date ` +
                    `from entry.timestamp: ${entry.timestamp}`
            )
        }
        return new LifecycleItem(
            entry.instanceId,
            entry.detail,
            entry.actionName,
            entry.done,
            entry.timestamp
        )
    }
}
