# Autoscale Core

[![version on main branch](https://img.shields.io/github/package-json/v/fortinet/autoscale-core?label=version%20on%20main%20branch)](./) [![latest release version](https://img.shields.io/github/v/release/fortinet/autoscale-core?label=latest%20release%20version)](https://github.com/fortinet/autoscale-core/releases/latest) [![platform](https://img.shields.io/badge/platform-AWS%20|%20Azure-green.svg)](./)

Autoscale Core is the core library for the Fortinet Autoscale project. This library is not a complete solution for FortiGate Autoscale. To find complete solutions, please check the following projects:

* [FortiGate Autoscale for AWS](https://github.com/fortinet/fortigate-autoscale-aws)
* [FortiGate Autoscale for Azure](https://github.com/fortinet/fortigate-autoscale-azure)

The Fortinet Autoscale project provides cloud-based multi-group auto scaling functionality for virtual machines of Fortinet products that have native HA features to form a cluster with failover protection.

This project provides the core logic of a hybrid licensing architecture and provides an interface that can be extended to deal with the differences in cloud platform APIs.

This project has the following features:

* Multi-group licensing models: Bring Your Own License (BYOL)-Only, Pay As You Go (PAYG)-Only, and Hybrid (any combination of BYOL and PAYG).
* AWS Transit Gateway integration (see: [https://github.com/fortinet/fortigate-autoscale-aws](https://github.com/fortinet/fortigate-autoscale-aws))

## Supported platforms

This project supports auto scaling for the cloud platforms listed below:

* Amazon AWS
* Microsoft Azure

## Technical documentation
* [Features and Terminologies](docs/features_and_terms.md)
* [Autoscale Handler Functions](docs/autoscale_handlers.md)
* [Autoscale Setting Items](docs/autoscale_setting_items.md)


## Installation

This project can be used as a NodeJS dependency. To install using NPM, run the following command from the project root directory:

`npm install https://github.com/fortinet/autoscale-core --save`

## Diagrams
![High Level Architecture](/docs/diagrams/Autoscale_3.0_design_High_level_architecture.png)

More technical diagrams are available in the [docs/diagrams](docs/diagrams) directory.

## Support

Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services. For direct issues, please refer to the [Issues](https://github.com/fortinet/autoscale-core/issues) tab of this GitHub project. For other questions related to this project, contact  [github@fortinet.com](mailto:github@fortinet.com).

## License

[License](./LICENSE) © Fortinet Technologies. All rights reserved.
