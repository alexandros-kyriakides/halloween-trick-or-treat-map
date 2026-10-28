import { defineBackend } from '@aws-amplify/backend';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { data } from './data/resource';
import { EVENT_SETTINGS } from './settings';

const backend = defineBackend({ data });

// One DynamoDB table holds every entry (one item per home/apartment), including its edit code.
// Find it in the AWS console: DynamoDB -> Tables -> halloween-map-entries-<branch> -> Explore items.
const branch = (process.env.AWS_BRANCH ?? 'sandbox').replace(/[^a-zA-Z0-9_.-]/g, '-');
const stack = backend.createStack('HalloweenEntries');

const table = new Table(stack, 'EntriesTable', {
  tableName: `halloween-map-entries-${branch}`,
  partitionKey: { name: 'id', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  encryption: TableEncryption.AWS_MANAGED,
  // Items carry expiresAt = DELETE_AT; DynamoDB deletes them automatically after that time.
  timeToLiveAttribute: 'expiresAt',
  // Deleting the Amplify app/branch also deletes the table and its data.
  removalPolicy: RemovalPolicy.DESTROY,
});

backend.data.addDynamoDbDataSource('EntriesTable', table);

// Settings readable by the resolvers as ctx.env.*
backend.data.resources.cfnResources.cfnGraphqlApi.environmentVariables = { ...EVENT_SETTINGS };

new CfnOutput(stack, 'EntriesTableName', { value: table.tableName });
