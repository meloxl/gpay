import ec2 = require('@aws-cdk/aws-ec2');
import rds = require('@aws-cdk/aws-rds');
import cdk = require('@aws-cdk/cdk');
import elasticache = require('@aws-cdk/aws-elasticache');
import ecs = require("@aws-cdk/aws-ecs");
import autoscaling = require("@aws-cdk/aws-autoscaling");
import { EcsOptimizedAmi } from '@aws-cdk/aws-ecs';
import cloudwatch = require("@aws-cdk/aws-cloudwatch");

// import events = require('@aws-cdk/aws-events');
// import lambda = require('@aws-cdk/aws-lambda');
// import fs = require('fs');

interface GPAYStackProps extends cdk.StackProps {
  cacheNodeType: string;
  engine: string;
}

export class RDS extends cdk.Stack {
  // public readonly vpcprivateSubnets: ec2.;


  constructor(scope: cdk.App, id: string, props: GPAYStackProps) {
    super(scope, id, props);

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

    new ec2.Connections({
      securityGroups: [rds_sg],
      defaultPortRange: new ec2.TcpPort(3306)
    }); 

    new rds.DatabaseCluster(this,'Database', {
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

    
    const redissubnet = new elasticache.CfnSubnetGroup(this, 'redissug',{
      description: 'gpay-prod-redis',
      subnetIds: vpc.privateSubnets.map(function(subnet) {
        return subnet.subnetId;
      }),
      cacheSubnetGroupName: "gpay-prod-redis",
    })

    const redispar = new elasticache.CfnParameterGroup(this , 'redispg',{
      cacheParameterGroupFamily: "redis4.0",
      description: "gpay-prod-redis",
    })

    // The security group that defines network level access to the cluster
    const redis_sg = new ec2.SecurityGroup(this, 'redis_sg', {
      vpc,
      description: 'RDS security group',
      allowAllOutbound: true   // Can be set to false
    });
    redis_sg.addIngressRule(new ec2.CidrIPv4('10.0.0.0/16'), new ec2.TcpPort(6379), 'RDS security group');   

    new ec2.Connections({
      securityGroups: [redis_sg],
      defaultPortRange: new ec2.TcpPort(6379)
    });

    new elasticache.CfnCacheCluster(this, 'GpayRedis',{
      cacheNodeType: props.cacheNodeType ,     //'cache.t2.micro',
      engine: props.engine ,      //'redis',
      numCacheNodes: 1,
      clusterName: "gpayredis",
      engineVersion: "4.0.10",
      autoMinorVersionUpgrade: false,
      port: 6379,
      vpcSecurityGroupIds: [
          redis_sg.securityGroupId
      ],
      cacheSubnetGroupName: redissubnet.subnetGroupName,
      cacheParameterGroupName: redispar.parameterGroupName

  })

// // cron lambda
//   const lambdaFn = new lambda.Function(this, 'Singleton', {
//     code: new lambda.InlineCode(fs.readFileSync('lambda-handler.py', { encoding: 'utf-8' })),
//     handler: 'index.main',
//     timeout: 300,
//     runtime: lambda.Runtime.Python27,
//   });

//   // Run every day at 6PM UTC
//   // See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
//   const rule = new events.EventRule(this, 'Rule', {
//     scheduleExpression: 'cron(0 18 ? * MON-FRI *)',
//   });
//   rule.addTarget(lambdaFn);

    // ecs cluter
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc
      // clusterName:
    });

    // Add capacity to it
    // cluster.addCapacity('Capacity', {
    //   instanceType: new ec2.InstanceType("t2.small"),
    //   desiredCapacity: 1,
    // });

    // Or add customized capacity. Be sure to start the Amazon ECS-optimized AMI.
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType('t2.small'),
      machineImage: new EcsOptimizedAmi({
        generation: ec2.AmazonLinuxGeneration.AmazonLinux2,
      }),
      keyName: "vela",

      // Or use Amazon ECS-Optimized Amazon Linux 2 AMI
      // machineImage: new EcsOptimizedAmi({ generation: ec2.AmazonLinuxGeneration.AmazonLinux2 }),
      desiredCapacity: 1,
      minCapacity: 1,
      maxCapacity: 2,
      // ... other options here ...
    });

    cluster.addAutoScalingGroup(autoScalingGroup);
    autoScalingGroup.addSecurityGroup(exssh_sg);
    autoScalingGroup.addSecurityGroup(exelb_sg);
    autoScalingGroup.addSecurityGroup(inelb_sg);


    const workerUtilizationMetric = new cloudwatch.Metric({
      namespace: 'MyService',
      metricName: 'WorkerUtilization'
    });

    // Step scaling
    autoScalingGroup.scaleOnMetric('ScaleToCPU',{
      metric: workerUtilizationMetric,
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 50, change: +1 },
        { lower: 70, change: +3 },
      ],
      // Change this to AdjustmentType.PercentChangeInCapacity to interpret the
      // 'change' numbers before as percentages instead of capacity counts.
      adjustmentType: autoscaling.AdjustmentType.ChangeInCapacity,
    });


  }
}

const app = new cdk.App();

new RDS(app, 'GpayInfraRDS', {
  cacheNodeType: "cache.t2.micro",
  engine: "redis",
});

app.run();