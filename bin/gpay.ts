#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/cdk');
import { GpayStack } from '../lib/gpay-stack';

const app = new cdk.App();
new GpayStack(app, 'GpayStack');
app.run();
