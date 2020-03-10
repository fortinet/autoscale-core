import { FortiGateAutoscale } from '../index';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';

export class FortiGateAutoscaleAws extends FortiGateAutoscale<
    APIGatewayProxyEvent,
    Context,
    APIGatewayProxyResult
> {}
