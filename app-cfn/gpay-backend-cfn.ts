#!/usr/bin/env node

import cdk = require('@aws-cdk/cdk');
import { BaseStack } from './base-stack';

const app = new cdk.App();
new BaseStack(app, 'gpay-backend-stg', {
    appName: 'gpay-backend',
    stage: 'stg',
    imagePort: 80
});

// new BaseStack(app, 'gpay-backend-prod', {
//     appName: 'gpay-backend',
//     stage: 'prod',
//     imagePort: 80
// });
app.run();