import type { AWS } from '@serverless/typescript';

const stage = '${opt:stage, env:STAGE, "dev"}';

const serverlessConfiguration = {
  service: 'icebox',
  org: '${opt:org, env:SERVERLESS_ORG, "icecampus"}',
  app: '${opt:app, env:SERVERLESS_APP, "icebox"}',
  frameworkVersion: '4',
  configValidationMode: 'error',
  provider: {
    name: 'aws',
    runtime: 'nodejs20.x',
    profile: 'ice',
    stage,
    region: '${opt:region, env:AWS_REGION, "eu-south-1"}',
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      STAGE: '${sls:stage}',
      ASSIGNMENTS_BUCKET: '${self:custom.resources.assignmentsBucketName}',
      ASSIGNMENTS_TABLE: '${self:custom.resources.assignmentsTableName}',
      COURSES_TABLE: '${self:custom.resources.coursesTableName}',
      SES_SOURCE_EMAIL: '${env:SES_SOURCE_EMAIL}',
      SECRETS_PREFIX: '${env:SECRETS_PREFIX, "/icebox/${sls:stage}/"}'
    },
    iam: {
      role: {
        statements: [
          {
            Effect: 'Allow',
            Action: ['s3:PutObject', 's3:GetObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts', 's3:ListBucket'],
            Resource: [
              'arn:aws:s3:::${self:custom.resources.assignmentsBucketName}',
              'arn:aws:s3:::${self:custom.resources.assignmentsBucketName}/*'
            ]
          },
          {
            Effect: 'Allow',
            Action: ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:GetItem', 'dynamodb:Query'],
            Resource: [
              { 'Fn::GetAtt': ['AssignmentsTable', 'Arn'] },
              {
                'Fn::Join': [
                  '/',
                  [{ 'Fn::GetAtt': ['AssignmentsTable', 'Arn'] }, 'index/*']
                ]
              }
            ]
          },
          {
            Effect: 'Allow',
            Action: ['dynamodb:GetItem'],
            Resource: [{ 'Fn::GetAtt': ['CoursesTable', 'Arn'] }]
          },
          {
            Effect: 'Allow',
            Action: ['ses:SendEmail', 'ses:SendRawEmail'],
            Resource: '*'
          },
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetSecretValue'],
            Resource: [
              {
                'Fn::Sub': 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:${env:SECRETS_PREFIX}*'
              }
            ]
          }
        ]
      }
    },
    tags: {
      Project: 'ICEBox',
      Stage: '${sls:stage}'
    },
    httpApi: {
      cors: {
        allowedOrigins: ['*'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
          'Origin',
          'Accept'
        ],
        allowedMethods: ['OPTIONS', 'GET', 'POST'],
        maxAge: 3600
      }
    }
  },
  custom: {
    resources: {
      assignmentsBucketName: 'icebox-${sls:stage}-assignments',
      assignmentsTableName: 'icebox-${sls:stage}-metadata',
      coursesTableName: 'icebox-${sls:stage}-courses'
    }
  },
  build: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      target: 'node20',
      platform: 'node'
    }
  },
  package: {
    individually: true,
    patterns: ['!node_modules/.cache/**']
  },
  functions: {
    createUploadSession: {
      handler: 'src/functions/createUploadSession.handler',
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/uploads/sessions'
          }
        }
      ]
    },
    completeUpload: {
      handler: 'src/functions/completeUpload.handler',
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/uploads/{submissionId}/complete'
          }
        }
      ]
    },
    listStudentSubmissions: {
      handler: 'src/functions/listStudentSubmissions.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/students/{studentId}/submissions'
          }
        }
      ]
    },
    getDownloadUrl: {
      handler: 'src/functions/getDownloadUrl.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/downloads/{submissionId}/{token}'
          }
        }
      ]
    }
  },
  resources: {
    Resources: {
      AssignmentsBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: '${self:custom.resources.assignmentsBucketName}',
          LifecycleConfiguration: {
            Rules: [
              {
                Id: 'TransitionToGlacier',
                Status: 'Enabled',
                Transitions: [
                  {
                    StorageClass: 'GLACIER',
                    TransitionInDays: 30
                  }
                ]
              }
            ]
          },
          VersioningConfiguration: {
            Status: 'Enabled'
          },
          CorsConfiguration: {
            CorsRules: [
              {
                AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
                AllowedOrigins: ['*'],
                AllowedHeaders: ['*'],
                MaxAge: 3600
              }
            ]
          },
          Tags: [
            { Key: 'Project', Value: 'ICEBox' },
            { Key: 'Stage', Value: '${sls:stage}' }
          ]
        }
      },
      AssignmentsTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: '${self:custom.resources.assignmentsTableName}',
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [
            { AttributeName: 'submissionId', AttributeType: 'S' },
            { AttributeName: 'studentId', AttributeType: 'S' },
            { AttributeName: 'courseId', AttributeType: 'S' }
          ],
          KeySchema: [
            { AttributeName: 'submissionId', KeyType: 'HASH' }
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: 'byStudent',
              KeySchema: [
                { AttributeName: 'studentId', KeyType: 'HASH' },
                { AttributeName: 'courseId', KeyType: 'RANGE' }
              ],
              Projection: { ProjectionType: 'ALL' }
            }
          ],
          Tags: [
            { Key: 'Project', Value: 'ICEBox' },
            { Key: 'Stage', Value: '${sls:stage}' }
          ]
        }
      },
      CoursesTable: {
        Type: 'AWS::DynamoDB::Table',
        Properties: {
          TableName: '${self:custom.resources.coursesTableName}',
          BillingMode: 'PAY_PER_REQUEST',
          AttributeDefinitions: [{ AttributeName: 'courseCode', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'courseCode', KeyType: 'HASH' }],
          Tags: [
            { Key: 'Project', Value: 'ICEBox' },
            { Key: 'Stage', Value: '${sls:stage}' }
          ]
        }
      }
    }
  }
} satisfies AWS & {
  build: {
    esbuild: Record<string, unknown>;
  };
};

export default serverlessConfiguration;
