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
      SECRETS_PREFIX: '${env:SECRETS_PREFIX, "/icebox/${sls:stage}/"}',
      ADMIN_USER_POOL_ID: { Ref: 'AdminUserPool' } as unknown as string,
      ADMIN_USER_POOL_CLIENT_ID: { Ref: 'AdminUserPoolClient' } as unknown as string,
      ADMIN_USER_POOL_REGION: '${self:provider.region}',
      ARCHIVE_QUEUE_URL: { Ref: 'ArchiveQueue' } as unknown as string
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
            Action: [
              'cognito-idp:ListUsers',
              'cognito-idp:AdminCreateUser',
              'cognito-idp:AdminUpdateUserAttributes',
              'cognito-idp:AdminResetUserPassword',
              'cognito-idp:AdminDeleteUser'
            ],
            Resource: [{ 'Fn::GetAtt': ['AdminUserPool', 'Arn'] }]
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
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem',
              'dynamodb:Scan'
            ],
            Resource: [{ 'Fn::GetAtt': ['CoursesTable', 'Arn'] }]
          },
          {
            Effect: 'Allow',
            Action: ['ses:SendEmail', 'ses:SendRawEmail'],
            Resource: '*'
          },
          {
            Effect: 'Allow',
            Action: ['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
            Resource: [{ 'Fn::GetAtt': ['ArchiveQueue', 'Arn'] }]
          },
          {
            Effect: 'Allow',
            Action: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:ChangeMessageVisibility'],
            Resource: [{ 'Fn::GetAtt': ['ArchiveQueue', 'Arn'] }]
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
        allowedMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE'],
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
      timeout: 10,
      memorySize: 512,
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/uploads/{submissionId}/complete'
          }
        }
      ]
    },
    getUploadStatus: {
      handler: 'src/functions/getUploadStatus.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/uploads/{submissionId}'
          }
        }
      ]
    },
    processUploadArchive: {
      handler: 'src/functions/processUploadArchive.handler',
      timeout: 300,
      memorySize: 2048,
      events: [
        {
          sqs: {
            arn: { 'Fn::GetAtt': ['ArchiveQueue', 'Arn'] },
            batchSize: 1,
            maximumBatchingWindow: 0
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
    adminListCourses: {
      handler: 'src/functions/admin/listCourses.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/admin/courses'
          }
        }
      ]
    },
    adminCreateCourse: {
      handler: 'src/functions/admin/createCourse.handler',
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/admin/courses'
          }
        }
      ]
    },
    adminUpdateCourse: {
      handler: 'src/functions/admin/updateCourse.handler',
      events: [
        {
          httpApi: {
            method: 'put',
            path: '/admin/courses/{courseCode}'
          }
        }
      ]
    },
    adminDeleteCourse: {
      handler: 'src/functions/admin/deleteCourse.handler',
      events: [
        {
          httpApi: {
            method: 'delete',
            path: '/admin/courses/{courseCode}'
          }
        }
      ]
    },
    adminListUsers: {
      handler: 'src/functions/admin/listAdminUsers.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/admin/users'
          }
        }
      ]
    },
    adminInviteUser: {
      handler: 'src/functions/admin/inviteAdminUser.handler',
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/admin/users'
          }
        }
      ]
    },
    adminUpdateUser: {
      handler: 'src/functions/admin/updateAdminUser.handler',
      events: [
        {
          httpApi: {
            method: 'put',
            path: '/admin/users/{username}'
          }
        }
      ]
    },
    adminResetUserPassword: {
      handler: 'src/functions/admin/resetAdminUserPassword.handler',
      events: [
        {
          httpApi: {
            method: 'post',
            path: '/admin/users/{username}/reset-password'
          }
        }
      ]
    },
    adminDeleteUser: {
      handler: 'src/functions/admin/deleteAdminUser.handler',
      events: [
        {
          httpApi: {
            method: 'delete',
            path: '/admin/users/{username}'
          }
        }
      ]
    },
    listPublicCourses: {
      handler: 'src/functions/listPublicCourses.handler',
      events: [
        {
          httpApi: {
            method: 'get',
            path: '/courses'
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
      },
      ArchiveQueueDlq: {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: 'icebox-${sls:stage}-archive-dlq',
          MessageRetentionPeriod: 1209600,
          Tags: [
            { Key: 'Project', Value: 'ICEBox' },
            { Key: 'Stage', Value: '${sls:stage}' }
          ]
        }
      },
      ArchiveQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: 'icebox-${sls:stage}-archive',
          VisibilityTimeout: 400,
          RedrivePolicy: {
            deadLetterTargetArn: { 'Fn::GetAtt': ['ArchiveQueueDlq', 'Arn'] },
            maxReceiveCount: 3
          },
          Tags: [
            { Key: 'Project', Value: 'ICEBox' },
            { Key: 'Stage', Value: '${sls:stage}' }
          ]
        }
      },
      AdminUserPool: {
        Type: 'AWS::Cognito::UserPool',
        Properties: {
          UserPoolName: '${self:service}-${sls:stage}-admin',
          MfaConfiguration: 'OFF',
          UsernameAttributes: ['email'],
          AutoVerifiedAttributes: ['email'],
          AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: true,
            InviteMessageTemplate: {
              EmailSubject: 'You have been invited to ICEBox admin',
              EmailMessage:
                'Hello,\n\nYou have been invited to the ICEBox admin portal.\n\nUsername: {username}\nTemporary password: {####}\n\nPlease sign in and change your password within 7 days.\n\nThanks,\nICEBox'
            }
          },
          Policies: {
            PasswordPolicy: {
              MinimumLength: 12,
              RequireUppercase: true,
              RequireLowercase: true,
              RequireNumbers: true,
              RequireSymbols: true,
              TemporaryPasswordValidityDays: 7
            }
          },
          AccountRecoverySetting: {
            RecoveryMechanisms: [
              {
                Name: 'verified_email',
                Priority: 1
              }
            ]
          },
          DeletionProtection: 'INACTIVE'
        }
      },
      AdminUserPoolClient: {
        Type: 'AWS::Cognito::UserPoolClient',
        Properties: {
          UserPoolId: { Ref: 'AdminUserPool' },
          ClientName: 'icebox-${sls:stage}-admin-web',
          GenerateSecret: false,
          ExplicitAuthFlows: [
            'ALLOW_USER_SRP_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH',
            'ALLOW_ADMIN_USER_PASSWORD_AUTH',
            'ALLOW_CUSTOM_AUTH',
            'ALLOW_USER_PASSWORD_AUTH'
          ],
          PreventUserExistenceErrors: 'ENABLED',
          RefreshTokenValidity: 30,
          AccessTokenValidity: 1,
          IdTokenValidity: 1,
          TokenValidityUnits: {
            AccessToken: 'hours',
            IdToken: 'hours',
            RefreshToken: 'days'
          },
          SupportedIdentityProviders: ['COGNITO'],
          EnableTokenRevocation: true,
          AuthSessionValidity: 3
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
