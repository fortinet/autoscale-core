# Autoscale handler functions

Autoscale handler functions are the endpoint of Autoscale services including license assignment, bootstrap configuration, heartbeat sync, primary election, and cloud platform scaling event handling.

The functions are deployed onto a cloud-based API management service over HTTPS that forwards incoming requests to the Autoscale backend service. This is similar to API Gateway in AWS or Function App in Microsoft Azure.

## Function endpoint

Autoscale handler functions use the same URL domain per deployment in the function endpoint. For instance, *abcdefgh.execute-api.us-east-1.amazonaws.com/prod*, for another, *abcdefgh.azurewebsites.net/api*

## Security

The functions must be protected against malicious requests. Technology to increase security varies between cloud platforms. Generally, methods to increase security include limiting access from within a certain virtual private network and IP ranges, and requests that include authentication tokens.

## Functions

### Endpoint: /byol-license

#### Purpose: license assignment

The device calls this function if it requires a valid license to run. If a license is available, the content of the license file is returned as a string in response to the request. If there are no licenses available, the function generates an error to the function log and returns an empty string. Additionally, an Autoscale notification for this error is sent to the cloud platform if the cloud platform, such as AWS, supports sending custom notifications.

### Endpoint: /fgt-as-handler

#### Purpose: bootstrap configuration

The device calls this function if it requires a bootstrap configuration on its first boot as initially scaled out into the scaling group. After receiving the bootstrap configuration, the device can configure itself as part of the autoscaling cluster and knows which device is the primary device for it to synchronize with.

#### Purpose: heartbeat sync

This function receives periodic heartbeat sync requests from each device in the autoscaling cluster. Each device proactively sends a heartbeat sync request at a determined interval with the device's current stats and other information that helps the Autoscale handler make decisions to elect the best primary device whenever necessary.

#### Purpose: platform scaling events

This function can handle scaling events from the cloud platform such as scaling group scaling out events, scaling in events, lifecycle hooks (AWS), etc. These events are usually processed to help the VM land properly in the scaling group; help to add additional components to the VM such as NIC, VPN before it lands; help to clean up the database once a VM is terminating; help to detach and recycle the components such as NIC, VPN from the terminating VM.

### Endpoint: /faz-auth-handler

#### Purpose: authorizing FortiGates in the connected FAZ

The device calls this function when a new FortiGate connects to the FortiAnalyzer, so that the FortiAnalyzer can authorize the connection and receive logs sent from the FortiGate.

### Endpoint: /faz-auth-scheduler

#### Purpose: sending authorization requests to faz-auth-handler at a scheduled time

This function schedules periodically sending faz authorization requests to the FortiAnalyzer to ensure the authorizations are handled and updated.
