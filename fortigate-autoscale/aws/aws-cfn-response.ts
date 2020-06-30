/*
   This file is a Fortinet-modified version of the original source file from AWS.
   Fortinet uses this file in compliance with the copyright statement and license
   below (the "Copyright Notice" section).
   Fortinet distributes this file within Fortinet's projects and only. Copyright and License of the
   project applies to this file.

   Copyright Notice

   Copyright 2015 Amazon Web Services, Inc. or its affiliates. All Rights Reserved.
   This file is licensed to you under the AWS Customer Agreement (the "License").
   You may not use this file except in compliance with the License.
   A copy of the License is located at http://aws.amazon.com/agreement/ .
   This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
   express or implied.
   See the License for the specific language governing permissions and limitations under the
   License.
*/

import https from 'https';
import url from 'url';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';

import { JSONable } from '../../jsonable';

export enum ResponseStatus {
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED'
}
export function send(
    event: CloudFormationCustomResourceEvent,
    context: Context,
    responseStatus: ResponseStatus,
    responseData?: JSONable,
    physicalResourceId?: string,
    noEcho = false
): Promise<void> {
    return new Promise((resolve, reject) => {
        const responseBody = JSON.stringify({
            Status: responseStatus,
            Reason:
                `See the details in CloudWatch Log Group: ${context.logGroupName}, ` +
                `Log Stream: ${context.logStreamName}`,
            PhysicalResourceId: physicalResourceId || context.logStreamName,
            StackId: event.StackId,
            RequestId: event.RequestId,
            LogicalResourceId: event.LogicalResourceId,
            NoEcho: noEcho || false,
            Data: responseData || {}
        });

        console.log('Response body:\n', responseBody);

        const parsedUrl = url.parse(event.ResponseURL);
        const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: 'PUT',
            headers: {
                'content-type': '',
                'content-length': responseBody.length
            }
        };

        const request = https.request(options, function(response) {
            console.log(`Status code: ${response.statusCode}`);
            console.log(`Status message: ${response.statusMessage}`);
            resolve(context.done());
        });

        request.on('error', function(error) {
            console.log(`send(..) failed executing https.request(..): ${error}`);
            reject(context.done(error));
        });

        request.write(responseBody);
        request.end();
    });
}
