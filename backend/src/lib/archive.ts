import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';
import { ReadableStream as WebReadableStream } from 'stream/web';

type StoredFile = {
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  objectKey: string;
};

type ArchiveParameters = {
  s3: S3Client;
  bucket: string;
  submissionId: string;
  files: StoredFile[];
  archiveKey: string;
};

const toNodeReadable = (body: unknown): Readable => {
  if (!body) {
    throw new Error('Received empty body from S3');
  }

  if (body instanceof Readable) {
    return body;
  }

  if (typeof (body as Readable).pipe === 'function') {
    return body as Readable;
  }

  if (body instanceof WebReadableStream || typeof (body as { getReader?: () => unknown }).getReader === 'function') {
    return Readable.fromWeb(body as WebReadableStream);
  }

  if (Buffer.isBuffer(body)) {
    return Readable.from(body);
  }

  throw new Error('Unsupported S3 body type');
};

export const createZipArchive = async ({
  s3,
  bucket,
  submissionId,
  files,
  archiveKey
}: ArchiveParameters): Promise<number> => {
  const passThrough = new PassThrough();
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: archiveKey,
      Body: passThrough,
      ContentType: 'application/zip'
    }
  });

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (error: Error) => {
    throw error;
  });

  archive.pipe(passThrough);

  const hasNestedFolders = files.some((file) => (file.fileName ?? file.objectKey).includes('/'));
  const prefix = hasNestedFolders ? submissionId : undefined;

  for (const file of files) {
    const getObjectResult = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: file.objectKey
      })
    );

    const originalName = file.fileName ?? file.objectKey;
    const entryName = prefix ? `${prefix}/${originalName}` : originalName;
    const nodeStream = toNodeReadable(getObjectResult.Body);

    archive.append(nodeStream, { name: entryName });
  }

  const uploadPromise = upload.done();
  await archive.finalize();
  await uploadPromise;

  const head = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: archiveKey
    })
  );

  return head.ContentLength ?? files.reduce((acc, file) => acc + (file.size ?? 0), 0);
};
