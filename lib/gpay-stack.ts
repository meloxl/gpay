import cdk = require('@aws-cdk/cdk');
import { GpayCfnPipeline } from './pipeline';


export class GpayStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    new GpayCfnPipeline(this, 'Pipeline', {
      pipelineName: 'infra',
      stackName: 'GpayStack',
      templateName: 'GpayInfra',
      directory: 'infra/cdk'
    });
  }
}
