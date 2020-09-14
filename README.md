# Autoscale Core
The Core Library for the Fortinet Autoscale project.

The Autoscale project provides a cloud-based multi-group auto scaling functionality for virtual machines of Fortinet products which have native HA features to form a cluster with failover protection.

This project provides the fundamental, generic logics of a Hybrid Licensing architecture. It also includes implementations for certain popular cloud platforms.

This project has the following features:
 * Multi-group Hybrid Licensing models. (Hybrid, BYOL-Only, PAYG-Only)
 * AWS Transit Gateway Integration (see: https://github.com/fortinet/fortigate-autoscale-aws)


## Supported platforms
This project supports autoscaling for the cloud platforms listed below:
* Amazon AWS

## NodeJS dependency

To use this project as a dependency:

  1. Run `npm install https://github.com/fortinet/autoscale-core --save` at the project root directory.

## Documentation

  1. Technical diagrams are available in the [docs/diagrams](./docs/diagrams) directory.

# Support
Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services.
For direct issues, please refer to the [Issues](https://github.com/fortinet/autoscale-core/issues) tab of this GitHub project.
For other questions related to this project, contact [github@fortinet.com](mailto:github@fortinet.com).

## License
[License](https://github.com/fortinet/autoscale-core/blob/master/LICENSE) © Fortinet Technologies. All rights reserved.
