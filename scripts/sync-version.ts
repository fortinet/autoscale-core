#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import semver from 'semver';

const rootDir = path.resolve(path.basename(__filename), '../');
const packageInfo = JSON.parse(String(fs.readFileSync(path.resolve(rootDir, 'package.json'))));
const verStr = packageInfo.version;

// validate version arg
if (!semver.valid(verStr)) {
    throw new Error(`${verStr} isn't a valid semver. Expect a valid semver from the 1st argument.`);
}

const workingDirs: string[] = ['./fortigate-autoscale', './core'];

if (process.argv.length > 2 && process.argv[1] === '--dir' && process.argv[2]) {
    if (path.resolve(rootDir, process.argv[2]).startsWith(rootDir) === false) {
        throw new Error(
            `Working directory: ${process.argv[2]} does not reside in the project root.`
        );
    } else if (!workingDirs.includes(process.argv[2])) {
        workingDirs.push(process.argv[2]);
    }
}

const version = semver.parse(verStr);

console.log(`Top level package version:, ${chalk.green(version.version)}`);

// sync package version on each workingDir
const syncPackageVersion = (dirs: string[]): void => {
    dirs.forEach(dir => {
        const packageJsonPath = path.resolve(rootDir, dir, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            console.warn(`skip non-exist file: ${chalk.redBright(packageJsonPath)}`);
            return;
        }
        const buffer = fs.readFileSync(packageJsonPath);
        const packageJson = JSON.parse(String(buffer));
        const oldVersion = packageJson.version;
        packageJson.version = version.version;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));
        console.log(
            `update version: ${chalk.yellowBright(oldVersion)} ` +
                `-> ${chalk.green(packageJson.version)} on: ${packageJsonPath}.`
        );
    });
};
syncPackageVersion(workingDirs);
console.log('Sync version completed.');
