/**
 * export core modules
 */
export * from './autoscale-core';
export * from './autoscale-setting';
export * from './cloud-function-proxy';
export * from './master-election';
export * from './platform-adapter';
export * from './virtual-machine';
export * from './fortigate-autoscale';
export * from './context-strategy/autoscale-context';
export * from './context-strategy/nic-attachment-context';
export * from './context-strategy/scaling-group-context';
export * from './context-strategy/vpn-attachment-context';
export * from './context-strategy/bootstrap-context';
export * from './context-strategy/licensing-context';
import * as DBDef from './db-definitions';
export { DBDef };

/**
 * export fortigate-autoscale modules
 */
export * from './fortigate-autoscale/index';
