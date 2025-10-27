import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  Trash2,
  Upload,
  File as FileIcon
} from 'lucide-react';

import {
  completeUpload,
  createUploadSession,
  type CompleteUploadResponse
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

import type { JSX } from 'react';

type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

type UploadItem = {
  id: string;
  file: File;
  relativePath: string;
  status: UploadStatus;
  progress: number;
  error?: string;
};

type UploadFormState = {
  studentId: string;
  studentName: string;
  courseId: string;
  studentEmail: string;
  comment: string;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const statusMeta: Record<
  UploadStatus,
  { label: string; icon: JSX.Element; className: string; textClassName: string }
> = {
  pending: {
    label: 'Pending',
    icon: <FileIcon className="h-4 w-4 text-muted-foreground" />,
    className: 'border-dashed border-muted',
    textClassName: 'text-muted-foreground'
  },
  uploading: {
    label: 'Uploading',
    icon: <Upload className="h-4 w-4 text-primary" />,
    className: 'border-primary/40',
    textClassName: 'text-primary'
  },
  uploaded: {
    label: 'Uploaded',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    className: 'border-emerald-500/40',
    textClassName: 'text-emerald-500'
  },
  error: {
    label: 'Error',
    icon: <AlertCircle className="h-4 w-4 text-red-500" />,
    className: 'border-red-500/40',
    textClassName: 'text-red-500'
  }
};

export const UploadPage = () => {
  const [searchParams] = useSearchParams();
  const studentEmailParam = searchParams.get('studentEmail') ?? '';
  const studentNameParam = searchParams.get('studentName') ?? '';
  const courseCodeParam = searchParams.get('courseCode') ?? '';

  const initialFormState = useMemo<UploadFormState>(
    () => ({
      studentId: '',
      studentName: studentNameParam,
      courseId: courseCodeParam,
      studentEmail: studentEmailParam,
      comment: ''
    }),
    [courseCodeParam, studentEmailParam, studentNameParam]
  );

  const [form, setForm] = useState<UploadFormState>(initialFormState);
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CompleteUploadResponse | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initialFormState);
  }, [initialFormState]);

  const hasPrefilledContext = Boolean(studentEmailParam || studentNameParam || courseCodeParam);

  const { toast } = useToast();

  const createSessionMutation = useMutation({ mutationFn: createUploadSession });
  const completeUploadMutation = useMutation({ mutationFn: completeUpload });

  const fileCount = files.length;
  const totalSize = useMemo(
    () => files.reduce((acc, item) => acc + item.file.size, 0),
    [files]
  );

  const dedupeSignatures = useMemo(
    () =>
      new Set(files.map((item) => `${item.relativePath}-${item.file.size}-${item.file.lastModified}`)),
    [files]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      const additions: UploadItem[] = [];
      const seen = new Set(dedupeSignatures);
      for (const file of incoming) {
        const relativePath = file.webkitRelativePath || file.name;
        const signature = `${relativePath}-${file.size}-${file.lastModified}`;
        if (seen.has(signature)) {
          continue;
        }
        seen.add(signature);
        additions.push({
          id: crypto.randomUUID(),
          file,
          relativePath,
          status: 'pending',
          progress: 0
        });
      }
      if (additions.length > 0) {
        setFiles((prev) => [...prev, ...additions]);
      }
    },
    [dedupeSignatures]
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      addFiles(accepted);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: true,
    noClick: true,
    noKeyboard: true
  });

  const handleFolderSelect = () => folderInputRef.current?.click();

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const folderFiles = Array.from(event.target.files ?? []);
    addFiles(folderFiles);
    event.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const reset = () => {
    setFiles([]);
    setUploadResult(null);
    setForm(initialFormState);
  };

  const setFileState = (id: string, patch: Partial<UploadItem>) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...patch, id: file.id } : file))
    );
  };

  const uploadFiles = async () => {
    const trimmedCourseId = form.courseId.trim();
    if (!trimmedCourseId) {
      toast({
        title: 'Missing course',
        description: 'Course code is required to route your submission.',
        variant: 'destructive'
      });
      return;
    }

    const hasIdentity = Boolean(
      form.studentId.trim() || form.studentEmail.trim() || form.studentName.trim()
    );

    if (!hasIdentity) {
      toast({
        title: 'Missing student details',
        description: 'Add at least a student name or email so we can tag your submission.',
        variant: 'destructive'
      });
      return;
    }

    if (files.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Add at least one file or folder before uploading.',
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const payload = {
        studentId: form.studentId.trim() || undefined,
        studentName: form.studentName.trim() || undefined,
        courseId: trimmedCourseId,
        comment: form.comment.trim() || undefined,
        studentEmail: form.studentEmail.trim() || undefined,
        files: files.map((item) => ({
          fileName: item.relativePath,
          size: item.file.size,
          contentType: item.file.type || null
        }))
      };

      const session = await createSessionMutation.mutateAsync(payload);

      const snapshot = [...files];
      for (let index = 0; index < snapshot.length; index += 1) {
        const current = snapshot[index];
        const uploadTarget = session.files[index];

        setFileState(current.id, { status: 'uploading', progress: 4 });

        try {
          await axios.put(uploadTarget.uploadUrl, current.file, {
            headers: {
              'Content-Type': current.file.type || 'application/octet-stream'
            },
            onUploadProgress: (event) => {
              const total = event.total ?? current.file.size ?? 1;
              const percentage = Math.min(100, Math.round((event.loaded / total) * 100));
              setFileState(current.id, { progress: percentage });
            }
          });

          setFileState(current.id, { status: 'uploaded', progress: 100 });
        } catch (error) {
          console.error(error);
          setFileState(current.id, {
            status: 'error',
            error: 'Upload failed.'
          });
          throw error;
        }
      }

      const completed = await completeUploadMutation.mutateAsync({
        submissionId: session.submissionId,
        comment: form.comment.trim() || undefined,
        studentEmail: form.studentEmail.trim() || undefined,
        studentName: form.studentName.trim() || undefined
      });

      setUploadResult(completed);
      toast({
        title: 'Upload complete',
        description: 'Your files were uploaded successfully.'
      });
      setFiles([]);
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response
          ? error.response.data?.message ?? 'Server returned an error.'
          : 'Something went wrong while uploading. Please try again.';
      toast({
        title: 'Upload failed',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void uploadFiles();
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3 max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Upload your assignment
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          Drag in multiple files or an entire folder. Add any notes for your educator before you send.
          Educators are notified automatically.
        </p>
      </section>

      {!uploadResult && (
        <form className="grid gap-6 lg:grid-cols-[2fr,1fr] lg:items-start" onSubmit={onSubmit}>
          <Card
            className={cn(
              'flex flex-col border-2 border-dashed border-border bg-card/70 shadow-sm transition-colors lg:h-full',
              isDragActive && 'border-primary bg-primary/5'
            )}
          >
          <CardHeader>
            <CardTitle className="text-xl">Files</CardTitle>
            <CardDescription>
              Drop files anywhere inside this panel or use the buttons to browse.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <div
              {...getRootProps()}
              className={cn(
                'flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors',
                isDragActive ? 'border-primary bg-primary/10' : 'bg-background/60'
              )}
            >
              <input {...getInputProps()} />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium">Drop files here</p>
                <p className="text-sm text-muted-foreground">
                  Supports multiple files, folders, and large uploads.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button type="button" variant="outline" onClick={open} disabled={isUploading}>
                  Browse files
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleFolderSelect}
                  disabled={isUploading}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Upload folder
                </Button>
              </div>
            </div>

            <input
              ref={(element) => {
                if (element) {
                  folderInputRef.current = element;
                  element.setAttribute('webkitdirectory', 'true');
                  element.setAttribute('directory', 'true');
                }
              }}
              type="file"
              multiple
              className="hidden"
              onChange={handleFolderChange}
            />

            <Separator />

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{fileCount} item{fileCount === 1 ? '' : 's'} selected</span>
              <span>{formatBytes(totalSize)} total</span>
            </div>

            <ul className="space-y-3">
              {files.map((item) => {
                const meta = statusMeta[item.status];
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border bg-background/80 p-4 transition-colors',
                      meta.className
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="line-clamp-1 text-sm font-medium text-foreground sm:text-base">
                          {item.relativePath}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium">
                          {meta.icon}
                          <span className={meta.textClassName}>{meta.label}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeFile(item.id)}
                          disabled={isUploading}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove file</span>
                        </Button>
                      </div>
                    </div>
                    <Progress value={item.progress} />
                    {item.error && <p className="text-xs text-red-500">{item.error}</p>}
                  </li>
                );
              })}
              {files.length === 0 && (
                <li className="rounded-lg border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
                  Files you add will appear here with live upload progress.
                </li>
              )}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Upload links are valid for 28 days. Large files may take longer to finish.
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={isUploading || files.length === 0} onClick={reset}>
                Clear
              </Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading ? 'Uploading…' : 'Start upload'}
              </Button>
            </div>
          </CardFooter>
          </Card>

          <Card className="bg-card/80 shadow-sm flex flex-col lg:h-full">
          <CardHeader>
            <CardTitle className="text-xl">Submission details</CardTitle>
            <CardDescription>
              We’ll fill in your details automatically when you launch from Circle. Only educator notes
              are needed if everything looks correct.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {hasPrefilledContext ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Student
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {form.studentName || form.studentEmail || 'Student details provided'}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {form.studentEmail && <p>{form.studentEmail}</p>}
                    {form.studentId && <p>ID: {form.studentId}</p>}
                  </div>
                </div>
                <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Course
                  </p>
                  <p className="mt-2 text-lg font-semibold">{form.courseId}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Files are routed to the assigned educator for this course automatically.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="studentName">Student name (optional)</Label>
                  <Input
                    id="studentName"
                    value={form.studentName}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, studentName: event.target.value }))
                    }
                    placeholder="e.g. Jordan Lee"
                    disabled={isUploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID (optional)</Label>
                  <Input
                    id="studentId"
                    value={form.studentId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, studentId: event.target.value }))
                    }
                    placeholder="e.g. S123456"
                    disabled={isUploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="courseId">Course code</Label>
                  <Input
                    id="courseId"
                    value={form.courseId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, courseId: event.target.value }))
                    }
                    placeholder="e.g. NOV25-PYTHON"
                    disabled={isUploading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentEmail">Student email (optional)</Label>
                  <Input
                    id="studentEmail"
                    value={form.studentEmail}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, studentEmail: event.target.value }))
                    }
                    placeholder="student@example.edu"
                    type="email"
                    disabled={isUploading}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="comment">Notes for your educator</Label>
              <Textarea
                id="comment"
                value={form.comment}
                onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
                placeholder="Add context, special instructions, or links"
                className="min-h-[140px] resize-none"
                disabled={isUploading}
              />
            </div>
          </CardContent>
          </Card>
        </form>
      )}

      {uploadResult && (
        <Card className="bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Submission complete</CardTitle>
            <CardDescription>
              Reference ID <span className="font-semibold">{uploadResult.submissionId}</span>.
              Download links stay active for 28 days after completion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadResult.files.map((file) => (
              <div key={file.objectKey} className="rounded-md border border-muted bg-background/80 p-3">
                <p className="text-sm font-medium text-foreground">{file.fileName}</p>
                <a
                  className="text-xs text-primary underline underline-offset-2"
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download link
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
