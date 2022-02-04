# FortiGate Autoscale settings

Here is a list of all setting items the Autoscale will use. These setting items are stored in the Autoscale Database, in the Settings table. The Autoscale handler functions must work with all these settings items.

All items are created and initialized with values during deployment and before the initial run of the Autoscale. The initialization happens automatically.

## Editable vs. non-editable items

Some settings' values are determined per deployment and should not be changed after the deployment. Those setting items are marked as *not editable*, indicated with its *editable* column having *false* as its value.

Other settings' values can be changed from time to time to meet users* needs. Those setting items are marked as *editable*, indicated with its *editable* column having *true* as its value.

## Update settings

Manually changing the value of the setting item in the database is the only method to update the settings.

## Table of setting items

Explanation of columns:

_settingKey_: the key of the setting item to be referenced.

_description_: the description of the setting item.

_jsonEncoded_: the Boolean indicator whether this setting contains plaintext value of JSON encoded value.

_editable_: the Boolean indicator whether this setting is allowed to change its value or not.

| _settingKey_ | _description_ | _jsonEncoded_ | _editable_ |
| --- | --- | --- | --- |
| additional-configset-name-list | The comma-separated list of the name of a configset. These configsets are required dependencies for the Autoscale to work for a certain deployment. Can be left empty. | false | false |
| asset-storage-key-prefix | Asset storage key prefix. | false | false |
| asset-storage-name | Asset storage name. | false | false |
| autoscale-function-extend-execution | Allow one single Autoscale function to be executed in multiple extended invocations of a cloud platform function if it cannot finish within one invocation and its functionality supports splitting into extended invocations. | false | true |
| autoscale-function-max-execution-time | Maximum execution time (in seconds) allowed for an Autoscale Cloud Function that can run in one cloud function invocation or multiple extended invocations. | false | true |
| autoscale-handler-url | The Autoscale handler (cloud function) URL as the communication endpoint between Autoscale and device in the scaling group(s). | false | false |
| byol-scaling-group-desired-capacity | BYOL Scaling group desired capacity. | false | true |
| byol-scaling-group-max-size | BYOL Scaling group max size. | false | true |
| byol-scaling-group-min-size | BYOL Scaling group min size. | false | true |
| byol-scaling-group-name | The name of the BYOL auto scaling group. | false | true |
| custom-asset-container | The asset storage name for some user custom resources, such as: custom configset, license files, etc. | false | true |
| custom-asset-directory | The sub directory to the user custom resources under the custom-asset-container. | false | true |
| egress-traffic-route-table | The comma-separated list of route tables associated with any subnets, which should be configured to contain a route 0.0.0.0/0 to the primary FortiGate to handle egress traffic. | false | false |
| enable-external-elb | Toggle ON / OFF the external elastic load balancing for device in the external-facing Autoscale scaling group(s). | false | false |
| enable-fortianalyzer-integration | Enable FortiAnalyzer integration with the Autoscale FortiGate cluster. | false | false |
| enable-hybrid-licensing | Toggle ON / OFF the hybrid licensing feature. | false | false |
| enable-internal-elb | Toggle ON / OFF the internal elastic load balancing feature to allow traffic flow out the device in the Autoscale scaling groups(s) into an internal load balancer. | false | false |
| enable-second-nic | Toggle ON / OFF the secondary ENI creation on each device in the Autoscale scaling group(s). | false | false |
| enable-vm-info-cache | Toggle ON / OFF the VM info cache feature. It caches the VM info in the DB to reduce API calls to query a VM from the platform. | false | false |
| faz-handler-name | The FortiGate Autoscale - FortiAnalyzer handler function name. | false | false |
| faz-ip | The FortiGate Autoscale - FortiAnalyzer IP address. | false | false |
| fortigate-admin-port | The port number for administrative login to a FortiGate. | false | true |
| fortigate-autoscale-setting-saved | The flag whether FortiGate Autoscale settings are saved in the DB or not. | false | false |
| fortigate-autoscale-subnet-id-list | A comma-separated list of FortiGate Autoscale subnet IDs. | false | false |
| fortigate-autoscale-subnet-pairs | A list of paired subnets for north-south traffic routing purposes. Format: [{subnetId: [pairId1, pairId2, ...]}, ...] | true | false |
| fortigate-autoscale-virtual-network-cidr | CIDR of the virtual network that contains FortiGate Autoscale. | false | false |
| fortigate-autoscale-virtual-network-id | ID of the virtual network that contains FortiGate Autoscale. | false | false |
| fortigate-external-elb-dns | The DNS name of the elastic load balancer for the FortiGate scaling groups. | false | false |
| fortigate-internal-elb-dns | The DNS name of the internal elastic load balancer used by the FortiGate Autoscale solution. | false | false |
| fortigate-psk-secret | The PSK for FortiGate Autoscale synchronization. | false | true |
| fortigate-sync-interface | The interface the FortiGate uses for configuration synchronization. | false | true |
| fortigate-traffic-port | The port number for the load balancer to route traffic through FortiGates to the protected services behind the load balancer. | false | true |
| fortigate-traffic-protocol | The protocol for the traffic to be routed by the load balancer through FortiGates to the protected services behind the load balancer. | false | true |
| heartbeat-delay-allowance | The maximum amount of time (in seconds) allowed for network latency of the Autoscale device heartbeat arriving at the Autoscale handler. | false | true |
| heartbeat-interval | The length of time (in seconds) that an Autoscale device waits between sending heartbeat requests to the Autoscale handler. | false | true |
| heartbeat-loss-count | Number of consecutively lost heartbeats. When the heartbeat loss count is reached, the device is deemed unhealthy and failover activities commence. | false | true |
| license-file-directory | The sub directory for storing license files under the asset container. | false | true |
| payg-scaling-group-name | The name of the PAYG auto scaling group. | false | false |
| primary-election-timeout | The maximum time (in seconds) to wait for a primary election to complete. | false | true |
| primary-scaling-group-name | The name of the primary auto scaling group. | false | false |
| resource-tag-prefix | Resource tag prefix. Used on any resource that supports tagging or labeling. Such resource will be given a tag or label starting with this prefix. Also used as the name of the logical group for Autoscale resources in those cloud platforms which support such logical grouping. | false | true |
| scaling-group-desired-capacity | PAYG Scaling group desired capacity. | false | true |
| scaling-group-max-size | PAYG Scaling group max size. | false | false |
| scaling-group-min-size | PAYG Scaling group min size. | false | true |
| sync-recovery-count | The number of on-time heartbeats (as a positive integer) that a VM must send to recover from the unhealthy state. Unhealthy VMs are excluded as primary election candidates.| false | true |
| terminate-unhealthy-vm | Toggle for unhealthy VM-handling behaviors. Set to true to terminate unhealthy VMs or to false to keep the unhealthy VMs running. | false | true |
| vm-info-cache-time | The VM info cache time in seconds. | false | true |
| vpn-bgp-asn | The BGP Autonomous System Number used with VPN connections. | false | true |
