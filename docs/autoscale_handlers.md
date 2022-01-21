# Autoscale Handler Functions

Autoscale hander functions are the endpoint of Autoscale services including license assignment, bootstrap configuration, heartbeat sync, primary election, cloud platform scaling event handling.

The functions are deployed onto a cloud-based API management service over HTTPS that forwards incoming requests to the Autoscale backend service. Such as API Gateway in Amazon AWS, Function App in Microsoft Azure.

## Function endpoint

Autoscale handler functions use the same URL domain per deployment in the function endpoint. For instance, *abcdefgh.execute-api.us-east-1.amazonaws.com/prod*, for another, *abcdefgh.azurewebsites.net/api*

## Security

The functions must be protected against malicious requests. Technology to increase security varies between cloud platforms. Generally, the protections include limiting access from within a certain virtual private network and IP ranges, request with authentication tokens.

## Functions

### Endpoint: /byol-license

#### Purpose: license assignment

This function is called by the device which requires a valid license to run. If there is a license available, the content of the license file as a string will be returned in response to the request. If no available license is to allocate, the function will generate an error to the function log and return an empty string. Additionally, an Autoscale notification for this error will be sent to the cloud platform if the cloud platform, such as AWS, supports sending custom notifications.

### Endpoint: /fgt-as-handler

#### Purpose: bootstrap configuration

This function is called by the device which requires a bootstrap configuration on its first boot as initially scaled out into the scaling group. By receiving the bootstrap configuration, the device can configure itself as part of the autoscaling cluster and knows which device is the primary device for it to synchronize.

#### Purpose: heartbeat sync

This function receives periodic heartbeat sync requests from each device in the autoscaling cluster. Each device proactively sends heartbeat sync request at an interval with the device current running stats and other information that helps the Autoscale handler make decisions to elect the best primary device whenever necessary.

#### Purpose: platform scaling events

This function can handle scaling events from the cloud platform such as scaling group scaling out events, scaling in events, lifecycle hooks (AWS), etc. These events are usually processed to help the VM land properly in the scaling group; help to add additional components to the VM such as NIC, VPN before it lands; help to clean up the database once a VM is terminating; help to detach and recycle the components such as NIC, VPN from the terminating VM.

### Endpoint: /faz-auth-handler

#### Purpose: authorizing FortiGates in the connected FAZ

This function is called whenever a new FortiGate is connected to the FortiAnalyzer so the FortiAnalyzer can authorize it to send logs from the FortiGate device.

### Endpoint: /faz-auth-scheduler

#### Purpose: sending authorizing requests to faz-auth-handler on a scheduled time

This function schedules to periodically send faz authorization requests to the FortiAnalyzer to ensure the authorizations are handled and up to date.
