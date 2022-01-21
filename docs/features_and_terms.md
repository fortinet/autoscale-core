# FortiGate Autoscale core features and Terminologies

## Primary Election

One core feature of the FortiGate Autoscale is the Primary Election. The Primary Election is the process that Autoscale will constantly monitor the FortiGate in the VMSS and does the best efforts to find one FortiGate suitable for the primary role in the cluster. If the conditions of the environment have changed, and the Primary Election may be required to meet the environment, it will start as soon as possible.

Once a new primary election is needed, only those FortiGate device in *healthy* state are eligible to take the new primary role.

Each newly scaled-out FortiGate device is initially assigned a secondary role. The primary election mechanism will choose the best candidate among the existing FortiGate devices to be the new primary.

## Heartbeat Sync

### Heartbeat and Heartbeat interval

The Autoscale monitor FortiGate by the heartbeat sent from each device. Heartbeat is sent in a timely manner. Usually, heartbeat is sent with a 30 second interval, defined by the heartbeat interval Setting item. To change the setting, modify the setting item with key: heartbeat-interval in the DB and give it a numeric value as the desired interval and update the auto-scale heartbeat interval on the primary FortiGate.

Each heartbeat from any FortiGate arrives at the Autoscale handler either *on-time* or *late*. On-time heartbeats count towards the *healthy* state of the FortiGate device while late heartbeats count towards the *unhealthy* state.

### Late heartbeat

Since the FortiGate sends heartbeats regularly to the Autoscale handler via HTTPS, it may experience network conditions resulting in heartbeat arriving the handler later than expected. In this case, the heartbeat is considered a late heartbeat and will be counted as heartbeat loss count and increase the heartbeat loss count counter by 1.

### Heartbeat loss count

Any late heartbeat will increase the heartbeat loss count counter by 1. The counter will be reset to 0 if any heartbeat arrives at the handler on time. If the counter reaches a defined threshold, which is 10 by default, before reset, this FortiGate will be deemed temporarily unhealthy. The default heartbeat loss count is 10 (seconds), defined by the heartbeat loss count Setting item.

### Heartbeat delay allowance

Network latency is essential on the Internet, so FortiGate Autoscale allows to offset a certain amount of network delay against a late heartbeat. This time allowance defaults to 2 (seconds), defined by the heartbeat delay allowance Setting item.

### Healthy and Unhealthy States

As soon as the heartbeat loss count of one FortiGate reached its maximum amount, the FortiGate device is deemed _unhealthy_. Its state will be shown as out-of-sync in both the FortiGate Dashboard and in the Autoscale database.

### Sync recovery and Sync recovery count

The FortiGate Autoscale allows the FortiGate device to recover from an unhealthy state to a healthy state. The recovery is done by the Autoscale handler receiving enough number of on-time heartbeats consecutively. The number is called sync recovery count. The default number of the sync recovery count is 3. It requires 3 consecutive on-time heartbeats from an unhealthy device to go back to the healthy state.

## Autoscale Notifications

This feature allows users to subscribe to the following Autoscale activities:

- New primary election
- Late heartbeat occurrences
- Unhealth VM detection

This feature implementation relies on the cloud platform notification service. It is now only available in AWS.
