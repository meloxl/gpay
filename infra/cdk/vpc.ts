import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');
// import { InstanceType } from '@aws-cdk/aws-ec2';
import cdk = require('@aws-cdk/cdk');
import elasticache = require('@aws-cdk/aws-elasticache');

import events = require('@aws-cdk/aws-events');
import lambda = require('@aws-cdk/aws-lambda');
import fs = require('fs');

export class RDS extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // const vpc = new ec2.VpcNetwork(this, 'GpayVpc', { 

      const vpc = new ec2.VpcNetwork(this, 'GpayVpc', { 
        cidr: "10.0.0.0/16", 
        maxAZs: 2 ,
        subnetConfiguration: [
            {
              cidrMask: 26,
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

    //  network sg (ssh elb)
    const exssh_sg = new ec2.SecurityGroup(this, 'gpay-external-ssh', {
      vpc,
      description: 'Allow ssh access from the world',
      allowAllOutbound: true   // Can be set to false
    });
    exssh_sg.addIngressRule(new ec2.AnyIPv4(), new ec2.TcpPort(22), 'allow ssh access from the world');

    const inssh_sg = new ec2.SecurityGroup(this, 'gpay-internal-ssh', {
      vpc,
      description: 'Allow ssh access from bastion',
      allowAllOutbound: true   // Can be set to false
    });
    inssh_sg.addIngressRule(exssh_sg, new ec2.TcpPort(22), 'allow ssh access from bastion',true);

    const exelb_sg = new ec2.SecurityGroup(this, 'gpay-external-elb', {
      vpc,
      description: 'Allows external ELB traffic',
      allowAllOutbound: true   // Can be set to false
    });
    exelb_sg.addIngressRule(new ec2.AnyIPv4(), new ec2.TcpPort(80), 'allows external ELB traffic');

    const inelb_sg = new ec2.SecurityGroup(this, 'gpay-internal-elb', {
      vpc,
      description: 'Allows internal ELB traffic',
      allowAllOutbound: true   // Can be set to false
    });
    inelb_sg.addIngressRule(new ec2.CidrIPv4('10.0.0.0/16'), new ec2.TcpPort(80), 'allows internal ELB traffic');    

    //add new RDS sg
    const rds_sg = new ec2.SecurityGroup(this, 'gpayrds', {
      vpc,
      description: 'RDS security group',
      allowAllOutbound: true   // Can be set to false
    });
    rds_sg.addIngressRule(new ec2.CidrIPv4('10.0.0.0/16'), new ec2.TcpPort(3306), 'RDS security group');   

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
        instances: 1,
    });

    // elasticache servers
    const redissubnet = new elasticache.CfnSubnetGroup(this, 'redissug',{
      description: 'gpay-prod-redis',
      subnetIds:[
          "subnet-0d3b95b5f564e8783",
          "subnet-02aa592a8a1a213ea"
      ],
      cacheSubnetGroupName: "gpay-prod-redis",
    })

    const redispar = new elasticache.CfnParameterGroup(this , 'redispg',{
      cacheParameterGroupFamily: "redis4.0",
      description: "gpay-prod-redis",
    })

    new elasticache.CfnCacheCluster(this, 'GpayRedis',{
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      numCacheNodes: 1,
      clusterName: "gpayredis",
      engineVersion: "4.0.10",
      autoMinorVersionUpgrade: false,
      port: 6379,
      vpcSecurityGroupIds: [
          'sg-02baa918422ab1240'
      ],
      cacheSubnetGroupName: redissubnet.subnetGroupName,
      cacheParameterGroupName: redispar.parameterGroupName

  })

// cron lambda
  const lambdaFn = new lambda.Function(this, 'Singleton', {
    code: new lambda.InlineCode(fs.readFileSync('lambda-handler.py', { encoding: 'utf-8' })),
    handler: 'index.main',
    timeout: 300,
    runtime: lambda.Runtime.Python27,
  });

  // Run every day at 6PM UTC
  // See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
  const rule = new events.EventRule(this, 'Rule', {
    scheduleExpression: 'cron(0 18 ? * MON-FRI *)',
  });
  rule.addTarget(lambdaFn);



  }
}

const app = new cdk.App();

new RDS(app, 'GpayInfraRDS');

app.run();