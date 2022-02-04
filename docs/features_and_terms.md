# FortiGate Autoscale core features and terminology

## Primary election

One core feature of FortiGate Autoscale is primary election. Primary election is the process where Autoscale constantly monitors the FortiGate in the VMSS and gives the best effort to find one FortiGate suitable for the primary role in the cluster. If the environmental conditions have changed and primary election may be required to meet the new environment conditions, the primary election process starts as soon as possible.

Once a new primary election is needed, only FortiGate devices in a *healthy* state are eligible to take the new primary role.

Each newly scaled-out FortiGate device is initially assigned a secondary role. The primary election mechanism chooses the best candidate among the existing FortiGate devices to be the new primary.

## Heartbeat sync

### Heartbeat and Heartbeat interval

The Autoscale monitors FortiGates by the heartbeat that each device sends. FortiGates send their Heartbeat in a timely manner. Usually, a FortiGate sends its heartbeat within a 30 second interval, defined by the heartbeat interval setting item. To change the setting, modify the setting item with key: heartbeat-interval in the DB and give the desired interval as a numeric value in seconds and update the auto-scale heartbeat interval on the primary FortiGate.

Heartbeats from FortiGates arrive at the Autoscale handler *on-time* or *late*. On-time heartbeats count towards the *healthy* state of the FortiGate device while late heartbeats count towards the *unhealthy* state.

### Late heartbeat

Since the FortiGate sends heartbeats regularly to the Autoscale handler via HTTPS, it may experience network conditions resulting in the heartbeat arriving at the handler later than expected. In this case, the heartbeat is considered a late heartbeat and counted as heartbeat loss count. It also increases the heartbeat loss count counter by 1.

### Heartbeat loss count

Any late heartbeat increases the heartbeat loss count counter by 1. The counter resets to 0 if any heartbeat arrives at the handler on time. If the counter reaches a defined threshold, which is 10 by default, before reset, this FortiGate is deemed temporarily unhealthy. The default heartbeat loss count is 10 (seconds), defined by the heartbeat loss count setting item.

### Heartbeat delay allowance

Network latency is essential on the Internet, so FortiGate Autoscale allows offsetting a certain amount of network delay against a late heartbeat. This time allowance defaults to 2 (seconds), defined by the heartbeat delay allowance setting item.

### Healthy and unhealthy states

When the heartbeat loss count of a FortiGate reaches its maximum, the FortiGate device is deemed _unhealthy_. The FortiGate Dashboard and Autoscale database show Its state as out-of-sync.

### Sync recovery and sync recovery count

The FortiGate Autoscale allows the FortiGate device to recover from an unhealthy state to a healthy state. The recovery is done when the Autoscale handler receives a certain number of consecutive on-time heartbeats. This number is called the sync recovery count. The default sync recovery count is 3, meaning that an unhealthy device requires 3 consecutive on-time heartbeats to recover to the healthy state.

## Autoscale notifications

This feature allows users to subscribe to the following Autoscale activities:

- New primary election
- Late heartbeat occurrences
- Unhealthy VM detection

This feature implementation relies on the cloud platform notification service. It is now only available in AWS.
