# Autoscale Core
Autoscale Core is the core library for the Fortinet Autoscale project.

The Fortinet Autoscale project provides cloud-based multi-group auto scaling functionality for virtual machines of Fortinet products that have native HA features to form a cluster with failover protection.

This project provides the core logic of a hybrid licensing architecture and provides an interface that can be extended to deal with the differences in cloud platform APIs.

This project has the following features:
 * Multi-group licensing models: Bring Your Own License (BYOL)-Only, Pay As You Go (PAYG)-Only, and Hybrid (any combination of BYOL and PAYG).
 * AWS Transit Gateway integration (see: https://github.com/fortinet/fortigate-autoscale-aws)


## Supported platforms
This project supports auto scaling for the cloud platforms listed below:
* Amazon AWS

## Installation

This project can be used as a NodeJS dependency. To install using NPM, run the following command from the project root directory:

`npm install https://github.com/fortinet/autoscale-core --save`

## Diagrams

Technical diagrams are available in the [docs/diagrams](./docs/diagrams) directory.

# Support
Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services. For direct issues, please refer to the [Issues](https://github.com/fortinet/autoscale-core/issues) tab of this GitHub project. For other questions related to this project, contact  [github@fortinet.com](mailto:github@fortinet.com).

## License
[License](./LICENSE) © Fortinet Technologies. All rights reserved.
