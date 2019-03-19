#!/usr/bin/env node
import cdk = require('@aws-cdk/cdk');
// import { StaticSite } from './static-site';

interface GPAYInfrastructureStackProps extends cdk.StackProps {
    domainName: string;
    siteSubDomain: string;
}

class GPAYInfrastructureStack extends cdk.Stack {
    constructor(scope: cdk.App, name: string, props: GPAYInfrastructureStackProps) {
        super(scope, name, props);

        // new StaticSite(this, 'StaticSite', {
        //     domainName: props.domainName,
        //     siteSubDomain: props.siteSubDomain
        // });
   }
}

const app = new cdk.App();
new GPAYInfrastructureStack(app, 'GPAYStaticSiteInfraTest', {
    domainName: 'samartad.com',
    siteSubDomain: 'test'
});
new GPAYInfrastructureStack(app, 'GPAYStaticSiteInfraProd', {
    domainName: 'samartad.com', 
    siteSubDomain: 'www'
});
app.run();