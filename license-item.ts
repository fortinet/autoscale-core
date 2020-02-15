/*
Author: Fortinet
*
* A generic license item wrapper class.
*/

import * as crypto from 'crypto';

export enum LicenseChecksumAlgorithm {
    sha1 = 'sha1'
}

export class LicenseItem {
    private _checksum: string | null;
    private _content: string;
    private _algorithm = 'sha1';
    constructor(readonly fileName: string, readonly fileETag: string, content?: string) {
        this._checksum = null;
        this._content = content;
    }
    get id() {
        return this._checksum;
    }

    get content() {
        return this._content;
    }

    set content(value) {
        this._content = value;
        if (this._algorithm && this._content) {
            this._checksum = crypto
                .createHash(this._algorithm)
                .update(this._content, 'utf8')
                .digest('hex');
        } else {
            this._checksum = null;
        }
    }

    get algorithm() {
        return this._algorithm;
    }

    set algorithm(value) {
        this._algorithm = value;
        if (this._algorithm && this._content) {
            this._checksum = crypto
                .createHash(this._algorithm)
                .update(this._content, 'utf8')
                .digest('hex');
        } else {
            this._checksum = null;
        }
    }

    get checksum() {
        return this._checksum;
    }

    get blobKey() {
        return LicenseItem.generateBlobKey(this.fileName, this.fileETag);
    }

    updateChecksum(algorithm: LicenseChecksumAlgorithm, checksum: string) {
        this._algorithm = algorithm;
        this._checksum = checksum;
    }

    /**
     * Generate a key for the blob
     * @param {String} name fileName
     * @param {String} eTag etag of file
     * @returns {String} blobKey
     */
    static generateBlobKey(name: string, eTag: string) {
        return crypto
            .createHash('sha1')
            .update(`${name}-${eTag}`, 'utf8')
            .digest('hex');
    }
}
