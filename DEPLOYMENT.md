# Pianco - AWS Elastic Beanstalk Deployment Guide

This guide provides step-by-step instructions for deploying the Pianco application to AWS Elastic Beanstalk.

## Architecture Overview

Pianco is deployed as a multi-container Docker application with:
- **Frontend**: Static web application (port 8080)
- **Backend**: WebSocket server for real-time multiplayer piano (port 11088)
- **Load Balancer**: AWS Application Load Balancer for traffic routing
- **Region**: us-east-2 (Ohio)

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured (`aws configure`)
3. GitHub repository with the pianco code
4. GitHub secrets configured (see below)

## Step 1: Create S3 Bucket for Deployments

Create an S3 bucket to store deployment packages:

```bash
aws s3 mb s3://pianco-ebs-deployments --region us-east-2
```

Verify the bucket was created:

```bash
aws s3 ls | grep pianco-ebs-deployments
```

## Step 2: Create Elastic Beanstalk Application

Create the EBS application:

```bash
aws elasticbeanstalk create-application \
  --application-name pianco-webapp \
  --description "Pianco online multiplayer virtual piano" \
  --region us-east-2
```

Verify the application was created:

```bash
aws elasticbeanstalk describe-applications \
  --application-names pianco-webapp \
  --region us-east-2
```

## Step 3: Create Elastic Beanstalk Environment

Create the production environment:

```bash
aws elasticbeanstalk create-environment \
  --application-name pianco-webapp \
  --environment-name pianco-prod-webapp \
  --solution-stack-name "64bit Amazon Linux 2 v3.6.0 running Docker" \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value=t3.small \
    Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=LoadBalanced \
    Namespace=aws:elasticbeanstalk:environment:process:default,OptionName=HealthCheckPath,Value=/
```

**Note:** Environment creation takes 5-10 minutes. Monitor the status with:

```bash
aws elasticbeanstalk describe-environments \
  --environment-names pianco-prod-webapp \
  --region us-east-2 \
  --query "Environments[0].Status" \
  --output text
```

Wait until the status shows `Ready`.

## Step 4: Configure Environment Variables (Optional)

If you want to set custom server keys for JWT signing:

```bash
aws elasticbeanstalk update-environment \
  --environment-name pianco-prod-webapp \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SERVER_KEY,Value=your-secure-server-key \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=REMOTE_KEY,Value=your-secure-remote-key
```

Replace `your-secure-server-key` and `your-secure-remote-key` with your own secure random strings.

## Step 5: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   - **Name**: `MY_AWS_ACCES_KEY`
   - **Value**: Your AWS Access Key ID

   - **Name**: `MY_AWS_SECRET_KEY`
   - **Value**: Your AWS Secret Access Key

## Step 6: Deploy Using GitHub Actions

1. Go to the **Actions** tab in your GitHub repository
2. Select the **Deploy to PROD EBS** workflow
3. Click **Run workflow** button
4. Select the branch (usually `main` or `master`)
5. Click **Run workflow**

The deployment process will:
- Package the application code
- Upload to S3
- Create a new application version
- Deploy to Elastic Beanstalk
- Wait for the deployment to complete

## Step 7: Access Your Application

After successful deployment, get your application URL:

```bash
aws elasticbeanstalk describe-environments \
  --environment-names pianco-prod-webapp \
  --region us-east-2 \
  --query "Environments[0].CNAME" \
  --output text
```

Your application will be available at:
```
http://pianco-prod-webapp.us-east-2.elasticbeanstalk.com
```

## Monitoring and Logs

### View Environment Health

```bash
aws elasticbeanstalk describe-environment-health \
  --environment-name pianco-prod-webapp \
  --region us-east-2 \
  --attribute-names All
```

### View Recent Events

```bash
aws elasticbeanstalk describe-events \
  --environment-name pianco-prod-webapp \
  --region us-east-2 \
  --max-items 20
```

### Access Application Logs

1. Via AWS Console:
   - Go to Elastic Beanstalk → pianco-webapp → pianco-prod-webapp
   - Click **Logs** → **Request Logs** → **Last 100 Lines** or **Full Logs**

2. Via AWS CLI:
   ```bash
   aws elasticbeanstalk request-environment-info \
     --environment-name pianco-prod-webapp \
     --region us-east-2 \
     --info-type tail
   ```

## Troubleshooting

### Deployment Failed

Check the deployment events:
```bash
aws elasticbeanstalk describe-events \
  --environment-name pianco-prod-webapp \
  --region us-east-2 \
  --severity ERROR
```

### WebSocket Connection Issues

The `.ebextensions/01_proxy.config` file configures nginx for WebSocket support. Verify:
- Backend is running on port 11088
- Health check endpoint is responding
- Security groups allow traffic on required ports

### Environment Not Updating

If deployments seem stuck, check the environment status:
```bash
aws elasticbeanstalk describe-environments \
  --environment-names pianco-prod-webapp \
  --region us-east-2
```

You may need to manually abort and retry:
```bash
aws elasticbeanstalk abort-environment-update \
  --environment-name pianco-prod-webapp \
  --region us-east-2
```

## Updating the Application

To deploy a new version:
1. Push your changes to GitHub
2. Go to **Actions** → **Deploy to PROD EBS**
3. Click **Run workflow**

The GitHub Action will automatically create a new version and deploy it.

## Scaling Configuration

To adjust instance capacity:

```bash
aws elasticbeanstalk update-environment \
  --environment-name pianco-prod-webapp \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=1 \
    Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=4
```

## Cost Optimization

- **t3.small** instances are used by default (adjust based on load)
- Use **Auto Scaling** to handle traffic spikes
- Consider using **Spot Instances** for non-production environments
- Monitor costs in AWS Cost Explorer

## Cleanup

To delete the environment (this will stop all charges):

```bash
# Terminate the environment
aws elasticbeanstalk terminate-environment \
  --environment-name pianco-prod-webapp \
  --region us-east-2

# Wait for termination to complete (takes a few minutes)
aws elasticbeanstalk describe-environments \
  --environment-names pianco-prod-webapp \
  --region us-east-2 \
  --query "Environments[0].Status" \
  --output text

# Delete the application
aws elasticbeanstalk delete-application \
  --application-name pianco-webapp \
  --region us-east-2

# Delete the S3 bucket (remove all objects first)
aws s3 rb s3://pianco-ebs-deployments --force --region us-east-2
```

## Support

For issues related to:
- **AWS Configuration**: Check AWS Elastic Beanstalk documentation
- **Application Code**: Open an issue on GitHub
- **Deployment Pipeline**: Review GitHub Actions logs

## Additional Resources

- [AWS Elastic Beanstalk Documentation](https://docs.aws.amazon.com/elasticbeanstalk/)
- [Multi-container Docker Configuration](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create_deploy_docker_v2config.html)
- [WebSocket on Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/using-features.managing.elb.html)
