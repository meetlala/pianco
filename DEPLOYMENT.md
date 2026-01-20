# Pianco - AWS Elastic Beanstalk Deployment Guide

This guide provides step-by-step instructions for deploying the Pianco application to AWS Elastic Beanstalk.

## Architecture Overview

Pianco is deployed as a Docker Compose multi-container application with:
- **Frontend**: Static web application (port 8080)
- **Backend**: WebSocket server for real-time multiplayer piano (port 11088)
- **ECR**: Amazon Elastic Container Registry for Docker images
- **Load Balancer**: AWS Application Load Balancer for traffic routing
- **Region**: us-east-2 (Ohio)
- **Platform**: 64bit Amazon Linux 2023 v4.x running Docker

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI installed and configured (`aws configure`)
3. GitHub repository with the pianco code
4. GitHub secrets configured (see below)

## Step 1: Create S3 Bucket for Deployments

Create an S3 bucket to store deployment packages:

```bash
aws s3 mb s3://pianco-ebs-deploy --region us-east-2
```

Verify the bucket was created:

```bash
aws s3 ls | grep pianco-ebs-deploy
```

## Step 1.5: Create ECR Repositories

Create Amazon ECR repositories to store Docker images. ECS Multi-Container deployments require prebuilt images in a registry:

```bash
# Create frontend repository
aws ecr create-repository \
  --repository-name pianco/frontend \
  --region us-east-2

# Create backend repository
aws ecr create-repository \
  --repository-name pianco/backend \
  --region us-east-2
```

Verify repositories were created:

```bash
aws ecr describe-repositories \
  --repository-names pianco/frontend pianco/backend \
  --region us-east-2 \
  --query "repositories[*].[repositoryName,repositoryUri]" \
  --output table
```

Save the repository URIs for later use. They will have the format:
```
385626522460.dkr.ecr.us-east-2.amazonaws.com/pianco/frontend
385626522460.dkr.ecr.us-east-2.amazonaws.com/pianco/backend
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

## Step 2.5: Setup IAM Roles

Elastic Beanstalk requires IAM roles to manage AWS resources. For ECS Multi-Container deployments with ECR, ensure the EC2 instance role has ECR permissions:

```bash
# Add ECR read permissions to allow pulling Docker images from ECR
aws iam attach-role-policy \
  --role-name aws-elasticbeanstalk-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

If the `aws-elasticbeanstalk-ec2-role` doesn't exist, you'll need to create it first with the standard Elastic Beanstalk policies. The role also needs:
- `AWSElasticBeanstalkWebTier`
- `AWSElasticBeanstalkMulticontainerDocker`
- `AWSElasticBeanstalkWorkerTier`

## Step 3: Create Elastic Beanstalk Environment

Create the production environment using the Docker Compose platform:

```bash
aws elasticbeanstalk create-environment \
  --application-name pianco-webapp \
  --environment-name pianco-prod-webapp \
  --solution-stack-name "64bit Amazon Linux 2023 v4.9.1 running Docker" \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value=t3.xlarge \
    Namespace=aws:autoscaling:launchconfiguration,OptionName=IamInstanceProfile,Value=aws-elasticbeanstalk-ec2-role \
    Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=LoadBalanced \
    Namespace=aws:elasticbeanstalk:environment:process:default,OptionName=HealthCheckPath,Value=/
```

**Important Notes:**
- The solution stack name must be for Amazon Linux 2023 v4.x (Docker Compose support)
- The IAM instance profile must have ECR read permissions
- This uses Docker Compose format (`docker-compose.yml`)

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

## Step 5: Docker Compose Configuration

The `docker-compose.yml` file references pre-built ECR images:

```yaml
version: '3.8'
services:
  frontend:
    image: 385626522460.dkr.ecr.us-east-2.amazonaws.com/pianco/frontend:latest
    ports:
      - "8080:80"
    restart: always
    
  backend:
    image: 385626522460.dkr.ecr.us-east-2.amazonaws.com/pianco/backend:latest
    ports:
      - "11088:11088"
    restart: always
    environment:
      - PORT=11088
```

Replace `385626522460` with your AWS account ID.

**Note:** This file is already configured in the repository. The GitHub workflow will build images and push them to these ECR repositories before deployment.

## Step 6: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add:

   - **Name**: `MY_AWS_ACCES_KEY`
   - **Value**: Your AWS Access Key ID

   - **Name**: `MY_AWS_SECRET_KEY`
   - **Value**: Your AWS Secret Access Key

## Step 7: Deploy Using GitHub Actions

1. Go to the **Actions** tab in your GitHub repository
2. Select the **Deploy to PROD EBS** workflow
3. Click **Run workflow** button
4. Select the branch (usually `main` or `master`)
5. Click **Run workflow**

The deployment process will:
1. **Build Docker images**: Build frontend and backend images from Dockerfiles
2. **Push to ECR**: Push images to Amazon ECR with tags (commit SHA and `latest`)
3. **Package application**: Create deployment zip with `docker-compose.yml` and `.ebextensions`
4. **Upload to S3**: Upload deployment package to S3 bucket
5. **Create application version**: Register new version in Elastic Beanstalk
6. **Deploy to EBS**: Deploy the new version to the environment
7. **Pull images**: EBS pulls the Docker images from ECR
8. **Launch containers**: Start the frontend and backend containers via Docker Compose

**Important**: The workflow builds and pushes Docker images before deployment. This is required for Docker Compose deployments, as they use prebuilt images from a registry (not local Dockerfiles).

## Step 8: Access Your Application

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

## Deployment Architecture

The Docker Compose deployment uses the following architecture:

1. **GitHub Actions Workflow**: Builds Docker images and pushes to ECR
2. **Amazon ECR**: Stores the Docker images (frontend and backend)
3. **S3 Bucket**: Stores deployment packages containing `docker-compose.yml`
4. **Elastic Beanstalk**: Orchestrates Docker Compose services based on `docker-compose.yml`
5. **Docker Compose**: Runs the containers on EC2 instances
6. **Application Load Balancer**: Routes traffic to the containers

**Key Points:**
- Uses Docker Compose v3 format (`docker-compose.yml`)
- Requires prebuilt images in ECR (not local Dockerfiles)
- Images are built during CI/CD, not on the EC2 instance
- Suited for production with versioned image tags

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

### Docker Image Pull Errors

If you see errors like "unable to pull image from ECR":

1. Verify IAM permissions:
   ```bash
   aws iam list-attached-role-policies --role-name aws-elasticbeanstalk-ec2-role | grep ECR
   ```

2. Verify images exist in ECR:
   ```bash
   aws ecr describe-images \
     --repository-name pianco/frontend \
     --region us-east-2
   
   aws ecr describe-images \
     --repository-name pianco/backend \
     --region us-east-2
   ```

3. Check if images were pushed successfully in GitHub Actions logs

### Docker Compose Configuration Issues

If you see deployment errors related to Docker Compose:

1. Ensure `docker-compose.yml` is included in the deployment package
2. Verify the compose file uses version 3.x format
3. Ensure you're using Amazon Linux 2023 v4.x platform (for Docker Compose support)
4. Confirm ECR images exist and are accessible

### GitHub Actions Build Failures

If image builds fail in GitHub Actions:

1. Check Dockerfile syntax
2. Verify ECR repositories exist
3. Ensure AWS credentials are correct in GitHub secrets
4. Check ECR login step completed successfully

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

The GitHub Action will:
- Build new Docker images with updated code
- Tag them with the commit SHA and `latest`
- Push to ECR (overwriting the `latest` tag)
- Deploy the new version to Elastic Beanstalk
- EBS will pull the updated images and restart containers

**Image Versioning**: Each deployment creates images tagged with both:
- Commit SHA (e.g., `abc123def456`) - immutable version
- `latest` - always points to the most recent deployment

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
aws s3 rb s3://pianco-ebs-deploy --force --region us-east-2
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
