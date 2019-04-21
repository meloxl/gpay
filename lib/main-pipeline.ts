import cdk = require("@aws-cdk/cdk");
import codepipeline = require("@aws-cdk/aws-codepipeline");
import ecr = require("@aws-cdk/aws-ecr");
import codebuild = require("@aws-cdk/aws-codebuild");
// import {GitHubSourceAction} from "@aws-cdk/aws-codepipeline";
import iam = require("@aws-cdk/aws-iam");
import cfn = require("@aws-cdk/aws-cloudformation");
// import codecommit = require("@aws-cdk/aws-codecommit");
import sns = require("@aws-cdk/aws-sns");

export interface CommonPipeline{
    appName: string,
    ecrRepositoryName: string,
    codeRepositoryBranch: string,
    codeRepositoryName: string,
    stage: string,
    infraCfnStackName: string,
    domain: string,
    ecsClusterName: string,
    ecsServiceCpu: string,
    ecsServiceMemory: string,
    webRoot?: string,
    albSG: string,
    prodEcsClusterName: string,
}

export class StgPipeline extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, props: CommonPipeline) {
        super(scope, id);

        const pipeline = new codepipeline.Pipeline(this, props.appName + '-' + props.stage, {
            pipelineName: props.appName + '-' + props.stage
        });

        pipeline.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:DescribeImages"));

        // Source
        const sourceStage = pipeline.addStage({
            name: 'Source'
        });

        const imageRepo = ecr.Repository.import(this, 'ImageRepo', {
            repositoryName: props.ecrRepositoryName
        });

        const sourceAction = new ecr.PipelineSourceAction({
            actionName: 'ECR',
            repository: imageRepo,
            imageTag: 'latest',
            outputArtifactName: 'ecrOutput'
        });

        sourceStage.addAction(sourceAction);

        // Code github
        const githubAccessToken = new cdk.SecretParameter(this, 'GitHubToken', { ssmParameter: 'GitHubToken' });
        // const sourceCodeStage = pipeline.addStage({
        //     name: 'Source',
        //   });
        const sourceCodeAction = new codepipeline.GitHubSourceAction({
            actionName: 'GitHub_Source',
            owner: 'meloxl',
            repo: 'gpay',
            branch: 'master', // default: 'master'
            oauthToken: githubAccessToken.value,
            outputArtifactName: 'SourceCodeOutput', // this will be the name of the output artifact in the Pipeline
          });
          sourceStage.addAction(sourceCodeAction);

        // const codeCommitRep = codecommit.Repository.import(this, 'CodeCommit', {
        //     repositoryName: props.codeRepositoryName
        // });

        // const codeCommitSourceAction = new codecommit.PipelineSourceAction({
        //     actionName: 'CodeCommitSource',
        //     repository: codeCommitRep,
        //     branch: props.codeRepositoryBranch,
        //     outputArtifactName: 'codeCommitOutput'
        // });

        // sourceStage.addAction(codeCommitSourceAction);

        //Build
        // 1. Cloudformation template file for stg env
        const  stgInfraBuildProject = new codebuild.Project(this, 'StgInfraCfnBuild', {
            source: new codebuild.GitHubSource({owner: 'meloxl', repo: 'gpay', oauthToken: githubAccessToken.value}),
            // source: new codebuild.CodeCommitSource({repository: codeCommitRep}),
            buildSpec: 'infra/app-infra/app-cfn-buildspec.yml',
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
                environmentVariables: {
                    'ARTIFACTS_BUCKET': {
                        value: pipeline.artifactBucket.bucketName
                    },
                    'APP_NAME': {
                        value: props.appName
                    },
                    'ECR_REPOSITORY_NAME': {
                        value: props.ecrRepositoryName
                    },
                    'INFRA_CFN_STACK_NAME': {
                        value: props.infraCfnStackName
                    },
                    'ALB_SG': {
                        value: props.albSG
                    },
                },
                privileged: true
            },
            artifacts: new codebuild.S3BucketBuildArtifacts({
                bucket: pipeline.artifactBucket,
                name: 'output.zip'
            })
        });


        const stgInfraBuildAction = stgInfraBuildProject.toCodePipelineBuildAction({
            actionName: 'StgInfraBuildProject',
            inputArtifact: sourceCodeAction.outputArtifact,
            outputArtifactName: "CfnBuildOutput"
        });

        // buildStage.addAction(buildAction);
        pipeline.addStage({
            name: 'StgInfraBuild',
            actions: [stgInfraBuildAction]
        });

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAction('cloudformation:DescribeStackResources')
            .addAllResources()
        );

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage")
        );

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addAction('ec2:DescribeAvailabilityZones')
        );

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addAction('ec2:*')
        );

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addAction('rds:DescribeDBClusters')
        );

        stgInfraBuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions('elasticache:DescribeReplicationGroups',
                'elasticache:DescribeCacheClusters')
        );

        // test
        const stgStage = pipeline.addStage({
            name: 'StgInfraDeploy'
        });

        stgStage.addAction(new cfn.PipelineCreateReplaceChangeSetAction({
            actionName: 'PrepareChangesStage',
            stackName: props.appName + '-' + props.stage,
            changeSetName: 'StagedChangeSet',
            runOrder: 1,
            adminPermissions: true,
            templatePath: stgInfraBuildAction.outputArtifact.atPath(props.appName + '-' + props.stage + '.template.yaml')
        }));

        stgStage.addAction(new cfn.PipelineExecuteChangeSetAction({
            actionName: 'ExecuteChangesStage',
            stackName: props.appName + '-' + props.stage,
            changeSetName: 'StagedChangeSet',
            runOrder: 2
        }));

        //Build BG

        const stgBGbuildProject = new codebuild.Project(this, 'BuildProject', {
            source: new codebuild.GitHubSource({
                owner: 'meloxl',
                repo: 'gpay',
                oauthToken: githubAccessToken.value
            }),

        // const stgBGbuildProject = new codebuild.Project(this, 'StgBlueGreenDeploy', {
            // source: new codebuild.CodeCommitSource({repository: codeCommitRep}),
            buildSpec: 'infra/app-infra/prod-buildspec.yml',
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_NODEJS_10_1_0,
                environmentVariables: {
                    'DOMAIN': {
                        value: props.domain
                    },
                    'APP_NAME': {
                        value: props.appName
                    },
                    'INFRA_CFN_STACK_NAME': {
                        value: props.infraCfnStackName
                    },
                    'ECS_CLUSTER_NAME': {
                        value: props.ecsClusterName
                    },
                    'ECS_SERVICE_CPU': {
                        value: props.ecsServiceCpu
                    },
                    'ECS_SERVICE_MEMORY': {
                        value: props.ecsServiceMemory
                    },
                    'WEB_ROOT': {
                        value: props.webRoot
                    },
                    'STAGE': {
                        value: props.stage
                    }
                },
                privileged: true
            },
        });

        const stgBGbuildAction = stgBGbuildProject.toCodePipelineBuildAction({
            actionName: 'StgBlueGreenDeploy',
            inputArtifact: sourceCodeAction.outputArtifact,
            additionalInputArtifacts: [stgInfraBuildAction.outputArtifact]
        });

        // buildStage.addAction(buildAction);
        pipeline.addStage({
            name: 'StgBlueGreenDeploy',
            actions: [stgBGbuildAction]
        });

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("cloudformation:DescribeStackResources",
                "cloudformation:DescribeStacks",
                "cloudformation:CreateChangeSet",
                "cloudformation:DescribeChangeSet",
                "cloudformation:GetTemplateSummary",
                "cloudformation:ExecuteChangeSet")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("iam:CreateRole",
                "iam:PutRolePolicy",
                "iam:AttachRolePolicy",
                "iam:GetRole",
                "iam:PassRole")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("lambda:GetFunction",
                "lambda:CreateFunction",
                "lambda:UpdateFunctionCode")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("s3:*")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecs:*")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("codedeploy:CreateApplication",
                "codedeploy:CreateDeploymentGroup",
                "codedeploy:GetApplication",
                "codedeploy:GetDeploymentGroup",
                "codedeploy:CreateDeployment",
                "codedeploy:GetDeploymentConfig",
                "codedeploy:RegisterApplicationRevision",
                "codedeploy:GetDeployment",
                "codedeploy:BatchGetApplications",
                "codedeploy:BatchGetDeploymentGroups")
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addAction('rds:DescribeDBClusters')
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions('elasticache:DescribeReplicationGroups',
                'elasticache:DescribeCacheClusters')
        );

        stgBGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions('application-autoscaling:PutScalingPolicy',
                'application-autoscaling:RegisterScalableTarget')
        );

        // Manual approval
        const approveStage = pipeline.addStage({
            name: 'Approve'
        });
        const manualApproveAction = new codepipeline.ManualApprovalAction({
            actionName: 'Approve',
            notificationTopic: new sns.Topic(this, 'Approve'),
            notifyEmails: [
                "wanglixin@mobifun365.net"
            ]
        });

        approveStage.addAction(manualApproveAction);

        // prod
        const bGbuildProject = new codebuild.Project(this, 'BlueGreenDeploy', {
            source: new codebuild.GitHubSource({owner: 'meloxl', repo: 'gpay', oauthToken: githubAccessToken.value}),
            // source: new codebuild.CodeCommitSource({repository: codeCommitRep}),
            buildSpec: 'infra/blue-green-setup/buildspec.yml',
            environment: {
                buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_17_09_0,
                privileged: true,
                environmentVariables: {
                    'APP_NAME': {
                        value: props.appName
                    },
                    'STAGE': {
                        value: 'prod'
                    },
                    'ECS_CLUSTER_NAME': {
                        value: props.ecsClusterName
                    }
                },
            }
        });

        bGbuildProject.addToRolePolicy(new iam.PolicyStatement()
            .addAllResources()
            .addActions("ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:GetRepositoryPolicy",
                "ecr:DescribeRepositories",
                "ecr:ListImages",
                "ecr:DescribeImages",
                "ecr:BatchGetImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage",
                "ecs:DescribeServices",
                "s3:*",
                "codedeploy:GetApplication",
                "codedeploy:GetDeploymentGroup",
                "ecs:RegisterTaskDefinition",
                "iam:PassRole",
                "codedeploy:CreateDeployment",
                "codedeploy:GetDeploymentConfig",
                "codedeploy:RegisterApplicationRevision",
                "codedeploy:GetDeployment"));

        const bGbuildAction = bGbuildProject.toCodePipelineBuildAction({
            actionName: 'BlueGreenBuild',
            inputArtifact: sourceCodeAction.outputArtifact,
            additionalInputArtifacts: [stgInfraBuildAction.outputArtifact]
        });

        pipeline.addStage({
            name: 'BlueGreenBuild',
            actions: [bGbuildAction]
        });

        // // Destroy Stage env
        // const destroyStageEnvBuildProject = new codebuild.Project(this, 'DestroyStageEnv', {
        //     // source: new codebuild.GitHubSource({owner: 'Tiny-wlx', repo: 'cdk', oauthToken: githubAccessToken.value}),
        //     source: new codebuild.CodeCommitSource({repository: codeCommitRep}),
        //     buildSpec: 'lib/app-infra/destroy-stg-buildspec.yml',
        //     environment: {
        //         buildImage: codebuild.LinuxBuildImage.UBUNTU_14_04_DOCKER_17_09_0,
        //         privileged: true,
        //         environmentVariables: {
        //             'DELETE_STACK_NAME': {
        //                 value: props.appName + '-' + props.stage,
        //             }
        //         },
        //     }
        // });
        //
        // destroyStageEnvBuildProject.addToRolePolicy(new iam.PolicyStatement()
        //     .addAllResources()
        //     .addActions("cloudformation:DeleteStack"));
        //
        // const destroyStageEnvBuildAction = destroyStageEnvBuildProject.toCodePipelineBuildAction({
        //     actionName: 'DestroyStageEnvBuild',
        //     inputArtifact: codeCommitSourceAction.outputArtifact,
        // });
        //
        // pipeline.addStage({
        //     name: 'DestroyStageEnvBuild',
        //     actions: [destroyStageEnvBuildAction]
        // });
    }
}