import { HeadObjectCommand, RestoreObjectCommand } from '@aws-sdk/client-s3';

import { getS3Client } from './aws';
import { ASSIGNMENTS_BUCKET } from './env';

export type StorageInfo = {
  storageClass: string;
  restoreStatus: 'IN_PROGRESS' | 'COMPLETED' | null;
  restoreExpiresAt: string | null;
};

const parseRestoreHeader = (header: string | undefined): Pick<StorageInfo, 'restoreStatus' | 'restoreExpiresAt'> => {
  if (!header) {
    return { restoreStatus: null, restoreExpiresAt: null };
  }

  const ongoingMatch = header.match(/ongoing-request\s*=\s*"(\w+)"/);
  if (!ongoingMatch) {
    return { restoreStatus: null, restoreExpiresAt: null };
  }

  const ongoing = ongoingMatch[1] === 'true';
  if (ongoing) {
    return { restoreStatus: 'IN_PROGRESS', restoreExpiresAt: null };
  }

  const expiryMatch = header.match(/expiry-date\s*=\s*"([^"]+)"/);
  const restoreExpiresAt = expiryMatch ? new Date(expiryMatch[1]).toISOString() : null;

  return { restoreStatus: 'COMPLETED', restoreExpiresAt };
};

export const getStorageInfo = async (objectKey: string): Promise<StorageInfo> => {
  const s3 = getS3Client();
  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: ASSIGNMENTS_BUCKET,
      Key: objectKey
    })
  );

  const storageClass = response.StorageClass ?? 'STANDARD';
  const restore = parseRestoreHeader(response.Restore);

  return {
    storageClass,
    ...restore
  };
};

export const initiateRestore = async (objectKey: string, days = 7): Promise<void> => {
  const s3 = getS3Client();
  await s3.send(
    new RestoreObjectCommand({
      Bucket: ASSIGNMENTS_BUCKET,
      Key: objectKey,
      RestoreRequest: {
        Days: days,
        GlacierJobParameters: {
          Tier: 'Standard'
        }
      }
    })
  );
};

export const isGlacier = (storageClass: string | null | undefined): boolean =>
  storageClass === 'GLACIER' || storageClass === 'DEEP_ARCHIVE';
