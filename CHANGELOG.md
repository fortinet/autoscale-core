# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.0]- 2021-12-14

### Added

- [enhancement] heartbeat calculation improvement based on heartbeat request sequence and timestamp
- [enhancement] improve primary election facilitating the device sync info #85

### Changed

- [bugfix] a brand new vm elected as the new primary will lead to existing configuration loss

## [3.3.2]- 2021-10-25

### Changed

- [bugfix] [Azure] remove caching of load settings #92

## [3.3.1]- 2021-09-24

### Changed

- [update] FOS 7.0.1 compatibility update in configset files

## [3.3.0]- 2021-08-17

### Changed

- [enhancement] aws sns integration for unhealthy vm instance #70
- [bugfix] heartbeat timing calculation will base on previous arrival time #64
- [enhancement] allow to keep unhealthy vm in the scaling groups instead of terminating it #62
- [bugfix] incorrect value showed in logs for heartbeat sync #60
- [bugfix][AWS] 0735911 - Lambda function is unable to update the delay interval properly #61
- [enhancement] make no-vm-termination can work without the new setting item 'TerminateUnhealthyVm' #72

## [3.1.0]- 2020-09-21

### Changed

- [BREAKING CHANGE] this major version update contains breaking changes to the master branch.
- a complete rewrite in Typescript based on FortiGate Autoscale (https://github.com/fortinet/fortigate-autoscale).
- separate the logic into Core library project (this project) and cloud platform specific projects.
