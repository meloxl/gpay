import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds')
// import { InstanceType } from '@aws-cdk/aws-ec2';
import cdk = require('@aws-cdk/cdk');

export class RDS extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const vpc = new ec2.VpcNetwork(this, 'GpayVpc', { 

      const vpc = new ec2.VpcNetwork(this, 'GpayVpc', { 
        cidr: "10.0.0.0/16", 
        maxAZs: 2 ,
        subnetConfiguration: [
            {
              cidrMask: 20,
              name: 'Public',
              subnetType: ec2.SubnetType.Public,
            },
            {
              cidrMask: 20,
              name: 'Private',
              subnetType: ec2.SubnetType.Private,
            }
        ],
        natGateways: 1,
    });

    new rds.DatabaseCluster(this, 'Database', {
        engine: rds.DatabaseClusterEngine.Aurora,
        masterUser: {
            username: 'root',
            password: 'Mobifun365',
        },
        instanceProps: {
            instanceType: new ec2.InstanceTypePair(ec2.InstanceClass.Burstable2, ec2.InstanceSize.Small),
            vpcPlacement: {
                subnetsToUse: ec2.SubnetType.Private,
            },
            vpc
        },
        port: 3306,
        defaultDatabaseName: 'gpay',
        instances: 1
    });

  }
}

const app = new cdk.App();

new RDS(app, 'GpayInfraRDS');

app.run();