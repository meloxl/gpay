import cdk = require('@aws-cdk/cdk');
import { GpayCfnPipeline } from './pipeline';
import { StgPipeline } from './main-pipeline';


export class GpayStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    new GpayCfnPipeline(this, 'Pipeline', {
      pipelineName: 'infra',
      stackName: 'Infra',
      templateName: 'Infra',
      directory: 'infra/cdk'
    });

    // backend
    new StgPipeline(this, 'gpay-backend-stg', {
      appName: 'gpay-backend',
      ecrRepositoryName: 'columba-web',
      codeRepositoryName: 'columba-infra-cdk',
      codeRepositoryBranch: 'master',
      stage: 'stg',
      infraCfnStackName: 'GpayInfraRDS',
      domain: "l1181.com",
      ecsClusterName: 'gpay-stg',
      ecsServiceCpu: '256',
      ecsServiceMemory: '512',
      webRoot: '/var/www/html/backend/web',
    });
  }
}
