#!/usr/bin/env node

import cdk = require("@aws-cdk/cdk");
import ec2 = require("@aws-cdk/aws-ec2");
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");
import iam = require("@aws-cdk/aws-iam");
import {ApplicationProtocol, TargetType} from "@aws-cdk/aws-elasticloadbalancingv2";

export interface BaseStackProps extends cdk.StackProps{
    appName: string;
    stage: string;
    imagePort: number;
}

export class BaseStack extends cdk.Stack {
    constructor(parent: cdk.App, name: string, props: BaseStackProps) {
        super(parent, name, props);

        let appNameStage = props.appName + '-' + props.stage;

        // vpc
        const vpc = ec2.VpcNetwork.importFromContext(this, 'VPC', {
            vpcId: process.env.VPC_ID,
        });

        // Include a load balancer
        const lb = new elbv2.ApplicationLoadBalancer(this, appNameStage, {
            loadBalancerName: appNameStage,
            vpc: vpc,
            internetFacing: true,
            securityGroup: ec2.SecurityGroup.import(this, 'Security-Group', {
                securityGroupId: String(process.env.SG)
            })
        });


        const targetGroupBlue = new elbv2.ApplicationTargetGroup(this, appNameStage + '-' + 'blue', {
            targetGroupName: appNameStage + '-' + 'blue',
            vpc: vpc,
            port: props.imagePort,
            protocol: ApplicationProtocol.Http,
            targetType: TargetType.Instance,
            healthCheck: {
                path: '/site/health-check'
            }
        });

        new elbv2.ApplicationTargetGroup(this, appNameStage + '-' + 'green', {
            targetGroupName: appNameStage + '-' + 'green',
            vpc: vpc,
            port: props.imagePort,
            protocol: ApplicationProtocol.Http,
            targetType: TargetType.Instance,
            healthCheck: {
                path: '/site/health-check'
            }
        });

        const listenerBlueProd = lb.addListener(appNameStage + '-' + 'blue', {
            port: 80,
            open: true,
            defaultTargetGroups: [targetGroupBlue],
            protocol: ApplicationProtocol.Http,
        });
        listenerBlueProd.connections.allowToAnyIPv4(new ec2.TcpAllPorts());

        const listenerGreenStage = lb.addListener(appNameStage + '-' + 'green', {
            port: 9002,
            open: true,
            defaultTargetGroups: [targetGroupBlue],
            protocol: ApplicationProtocol.Http
        });
        listenerGreenStage.connections.allowToAnyIPv4(new ec2.TcpAllPorts());

        const taskDefExecutionRole = new iam.Role(this, appNameStage + 'TaskDefExecutionRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });

        taskDefExecutionRole.addToPolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:GetAuthorizationToken",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            )
        );

        new iam.Role(this, appNameStage + 'TaskDefTaskRole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
        });
    }
}
