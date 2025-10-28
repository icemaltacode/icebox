import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useDropzone, type DropEvent } from 'react-dropzone';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  Loader2,
  Trash2,
  Upload,
  File as FileIcon
} from 'lucide-react';

import {
  completeUpload,
  createUploadSession,
  getUploadStatus,
  listPublicCourses,
  type PublicCourse,
  type UploadStatusResponse
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import type { JSX } from 'react';

type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file: (callback: (file: File) => void, errorCallback?: (error: unknown) => void) => void;
  createReader?: () => FileSystemDirectoryReader;
  readEntries?: () => void;
};

type FileSystemDirectoryReader = {
  readEntries: (
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: unknown) => void
  ) => void;
};

const traverseEntry = (entry: FileSystemEntry, path: string): Promise<File[]> =>
  new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file(
        (file) => {
          const relativePath = `${path}${entry.name}`;
          Object.defineProperty(file, 'webkitRelativePath', {
            value: relativePath,
            configurable: true
          });
          resolve([file]);
        },
        (error) => reject(error ?? new Error('Failed to read file entry'))
      );
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      const allEntries: FileSystemEntry[] = [];

      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (!batch.length) {
              Promise.all(
                allEntries.map((child) =>
                  traverseEntry(child, `${path}${entry.name}/`)
                )
              )
                .then((nested) => resolve(nested.flat()))
                .catch(reject);
              return;
            }
            allEntries.push(...batch);
            readBatch();
          },
          (error) => reject(error ?? new Error('Failed to read directory entries'))
        );
      };

      readBatch();
    } else {
      resolve([]);
    }
  });

const collectFilesFromEvent = async (event: DropEvent): Promise<File[]> => {
  const dataTransfer = 'dataTransfer' in event ? event.dataTransfer : null;
  const items = dataTransfer?.items;

  if (items && items.length > 0) {
    const entryPromises: Promise<File[]>[] = [];
    for (const item of Array.from(items)) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entryPromises.push(traverseEntry(entry as FileSystemEntry, ''));
      } else {
        const file = item.getAsFile?.();
        if (file) {
          entryPromises.push(Promise.resolve([file]));
        }
      }
    }

    if (entryPromises.length > 0) {
      const files = await Promise.all(entryPromises);
      return files.flat();
    }
  }

  const fileList =
    ('target' in event && event.target && 'files' in event.target && event.target.files)
      ? event.target.files
      : dataTransfer?.files;

  return fileList ? Array.from(fileList) : [];
};

type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

type UploadItem = {
  id: string;
  file: File;
  relativePath: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  rootKey: string | null;
};

type UploadFormState = {
  studentId: string;
  studentName: string;
  courseId: string;
  studentEmail: string;
  educatorEmail: string;
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
  const decodeParam = (value: string | null): string => {
    if (!value) {
      return '';
    }
    let decoded = value;
    try {
      let next = decodeURIComponent(decoded);
      while (next !== decoded) {
        decoded = next;
        next = decodeURIComponent(decoded);
      }
      return decoded;
    } catch {
      return decoded;
    }
  };

  const studentEmailParam = decodeParam(searchParams.get('studentEmail'));
  const studentNameParam = decodeParam(searchParams.get('studentName'));
  const courseCodeParam = decodeParam(searchParams.get('class') ?? searchParams.get('courseCode'));
  const studentIdParam = decodeParam(searchParams.get('studentId'));

  const initialFormState = useMemo<UploadFormState>(
    () => ({
      studentId: studentIdParam,
      studentName: studentNameParam,
      courseId: courseCodeParam,
      studentEmail: studentEmailParam,
      educatorEmail: '',
      comment: ''
    }),
    [courseCodeParam, studentEmailParam, studentIdParam, studentNameParam]
  );

  const requireVleReferrer = import.meta.env.VITE_REQUIRE_VLE_REFERRER === 'true';
  const allowedVleReferrersRaw = import.meta.env.VITE_ALLOWED_VLE_REFERRERS ?? 'https://my.icecampus.com';
  const allowedVleReferrers = useMemo(
    () =>
      allowedVleReferrersRaw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    [allowedVleReferrersRaw]
  );
  const [referrerAllowed, setReferrerAllowed] = useState<boolean>(() => !requireVleReferrer);
  const [referrerChecked, setReferrerChecked] = useState<boolean>(() => !requireVleReferrer);

  useEffect(() => {
    if (!requireVleReferrer) {
      return;
    }

    if (typeof document === 'undefined') {
      setReferrerAllowed(false);
      setReferrerChecked(true);
      return;
    }

    const referrer = document.referrer ?? '';
    const allowed = allowedVleReferrers.some((entry) => referrer.startsWith(entry));
    setReferrerAllowed(allowed);
    setReferrerChecked(true);
  }, [allowedVleReferrers, requireVleReferrer]);

  const [form, setForm] = useState<UploadFormState>(initialFormState);
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadStatusResponse | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(initialFormState);
  }, [initialFormState]);

  const { toast } = useToast();

  const createSessionMutation = useMutation({ mutationFn: createUploadSession });
  const completeUploadMutation = useMutation({ mutationFn: completeUpload });

  const {
    data: coursesData,
    isLoading: coursesLoading,
    isError: coursesError
  } = useQuery({
    queryKey: ['publicCourses'],
    queryFn: listPublicCourses,
    staleTime: 5 * 60 * 1000
  });

  const courseGroups = useMemo(() => {
    if (!coursesData) {
      return [] as Array<{ name: string; courses: PublicCourse[] }>;
    }
    const grouped = new Map<string, PublicCourse[]>();
    coursesData.forEach((course) => {
      const name = course.courseName?.trim() || 'Other courses';
      if (!grouped.has(name)) {
        grouped.set(name, []);
      }
      grouped.get(name)?.push(course);
    });

    return Array.from(grouped.entries())
      .map(([name, courses]) => ({
        name,
        courses: courses.sort((a, b) => a.courseCode.localeCompare(b.courseCode))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [coursesData]);

  const courseLookup = useMemo(() => {
    const map = new Map<string, PublicCourse>();
    coursesData?.forEach((course) => map.set(course.courseCode, course));
    return map;
  }, [coursesData]);

  const pollSubmissionStatus = useCallback(
    async (submissionId: string): Promise<UploadStatusResponse> => {
      const timeoutMs = 5 * 60 * 1000;
      const intervalMs = 3000;
      const startedAt = Date.now();
      let lastErrorMessage: string | null = null;

      while (Date.now() - startedAt < timeoutMs) {
        let status: UploadStatusResponse | null = null;
        try {
          status = await getUploadStatus(submissionId);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            lastErrorMessage = error.response?.data?.message ?? error.message;
          } else if (error instanceof Error) {
            lastErrorMessage = error.message;
          } else {
            lastErrorMessage = 'Unknown error while checking upload status.';
          }
        }

        if (status) {
          const currentStatus = status.status;
          if (currentStatus === 'COMPLETED') {
            return status;
          }

          if (currentStatus === 'ARCHIVE_FAILED' || currentStatus === 'ARCHIVE_QUEUE_FAILED') {
            throw new Error(
              status.lastError ??
                'We were unable to process your upload. Please try again or contact support.'
            );
          }

          if (status.lastError) {
            lastErrorMessage = status.lastError;
          }
        }

        await new Promise((resolve) => {
          setTimeout(resolve, intervalMs);
        });
      }

      throw new Error(
        lastErrorMessage ?? 'Timed out while waiting for your upload to finish processing.'
      );
    },
    []
  );

  const selectedCourse = courseLookup.get(form.courseId);

  useEffect(() => {
    if (selectedCourse && form.educatorEmail) {
      setForm((prev) => ({ ...prev, educatorEmail: '' }));
    }
  }, [selectedCourse, form.educatorEmail]);

  const prefilledStudentName = Boolean(studentNameParam.trim());
  const prefilledStudentEmail = Boolean(studentEmailParam.trim());
  const prefilledCourseCode = Boolean(courseCodeParam.trim());
  const prefilledStudentId = Boolean(studentIdParam.trim());

  const hasPrefilledContext =
    prefilledStudentName || prefilledStudentEmail || prefilledCourseCode || prefilledStudentId;

  const courseListAvailable = !coursesError && courseGroups.length > 0;
  const selectValue = selectedCourse ? selectedCourse.courseCode : '';
  const showCourseDropdown = courseListAvailable && (!prefilledCourseCode || !selectedCourse);
  const noCoursesConfigured = !coursesError && !coursesLoading && !courseListAvailable;
  const showManualCourseFields = coursesError || noCoursesConfigured;
  const courseCodeLabelFor = showManualCourseFields ? 'manualCourseId' : 'courseIdSelect';

  const fileCount = files.length;
  const totalSize = useMemo(
    () => files.reduce((acc, item) => acc + item.file.size, 0),
    [files]
  );

  const displayEntries = useMemo(() => {
    type MutableDisplay = {
      id: string;
      label: string;
      status: UploadStatus;
      progress: number;
      fileIds: string[];
      isFolder: boolean;
      fileCount: number;
      totalSize: number;
      processedBytes: number;
      error?: string;
      order: number;
    };

    const groups = new Map<string, MutableDisplay>();
    let orderCounter = 0;

    const getStatusPriority = (status: UploadStatus) => {
      switch (status) {
        case 'error':
          return 3;
        case 'uploading':
          return 2;
        case 'pending':
          return 1;
        case 'uploaded':
        default:
          return 0;
      }
    };

    const entriesOrder: string[] = [];

    for (const item of files) {
      const key = item.rootKey ?? item.id;
      let group = groups.get(key);
      if (!group) {
        group = {
          id: key,
          label: item.rootKey ?? item.file.name,
          status: item.status,
          progress: item.progress,
          fileIds: [],
          isFolder: Boolean(item.rootKey),
          fileCount: 0,
          totalSize: 0,
          processedBytes: 0,
          order: orderCounter++
        };
        groups.set(key, group);
        entriesOrder.push(key);
      }

      group.fileIds.push(item.id);
      group.fileCount += 1;
      group.totalSize += item.file.size;
      group.processedBytes += (item.file.size * item.progress) / 100;
      if (getStatusPriority(item.status) > getStatusPriority(group.status)) {
        group.status = item.status;
        group.progress = item.progress;
        group.error = item.error;
      }
      if (item.status === group.status && item.error && !group.error) {
        group.error = item.error;
      }
    }

    return entriesOrder.map((key) => {
      const group = groups.get(key)!;
      const calculatedProgress = group.totalSize > 0 ? Math.min(100, Math.round(group.processedBytes / group.totalSize * 100)) : group.progress;
      const normalizedStatus: UploadStatus = group.status === 'uploaded' && calculatedProgress < 100 ? 'uploading' : group.status;
      return {
        id: group.id,
        label: group.isFolder ? `Folder: ${group.label}` : group.label,
        status: normalizedStatus,
        progress: normalizedStatus === 'uploaded' ? 100 : calculatedProgress,
        fileIds: group.fileIds,
        isFolder: group.isFolder,
        fileCount: group.fileCount,
        totalSize: group.totalSize,
        error: group.error
      };
    });
  }, [files]);

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
        const rootKey = relativePath.includes('/') ? relativePath.split('/')[0] : null;
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
          progress: 0,
          rootKey
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
    noKeyboard: true,
    getFilesFromEvent: collectFilesFromEvent
  });

  const handleFolderSelect = () => folderInputRef.current?.click();

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const folderFiles = Array.from(event.target.files ?? []);
    addFiles(folderFiles);
    event.target.value = '';
  };

  const removeFiles = (ids: string[]) => {
    const idSet = new Set(ids);
    setFiles((prev) => prev.filter((file) => !idSet.has(file.id)));
  };

  const reset = () => {
    setFiles([]);
    setUploadResult(null);
    setForm(initialFormState);
    setStatusMessage(null);
  };

  const setFileState = (id: string, patch: Partial<UploadItem>) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...patch, id: file.id } : file))
    );
  };

  const uploadFiles = async () => {
    const trimmedCourseId = form.courseId.trim();
    const trimmedStudentName = form.studentName.trim();
    const trimmedStudentEmail = form.studentEmail.trim();
    const trimmedStudentId = form.studentId.trim();
    const trimmedEducatorEmail = form.educatorEmail.trim();

    if (!trimmedCourseId) {
      toast({
        title: 'Select a course',
        description: 'Choose the course code so we can route your submission.',
        variant: 'destructive'
      });
      return;
    }

    const requiresManualCourseDetails = coursesError || noCoursesConfigured;
    const requiresKnownCourseSelection = !requiresManualCourseDetails && !selectedCourse;

    if (!trimmedStudentName) {
      toast({
        title: 'Student name required',
        description: 'Add the student name so we know who submitted this work.',
        variant: 'destructive'
      });
      return;
    }

    if (!trimmedStudentEmail) {
      toast({
        title: 'Student email required',
        description: 'Add the student email address so we can send confirmation messages.',
        variant: 'destructive'
      });
      return;
    }

    const hasIdentity = Boolean(trimmedStudentId || trimmedStudentEmail || trimmedStudentName);

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

    if (requiresKnownCourseSelection) {
      toast({
        title: 'Choose a course',
        description: 'Select a course from the list so we can route your submission correctly.',
        variant: 'destructive'
      });
      return;
    }

    if (requiresManualCourseDetails) {
      if (!trimmedCourseId) {
        toast({
          title: 'Course code required',
          description: 'Enter the course code so we can route your submission.',
          variant: 'destructive'
        });
        return;
      }

      if (!trimmedEducatorEmail) {
        toast({
          title: 'Educator email required',
          description: 'Provide the educator’s email so we know who should receive the files.',
          variant: 'destructive'
        });
        return;
      }
    }

    setIsUploading(true);
    setUploadResult(null);
    setStatusMessage(null);

    try {
      const educatorEmailsPayload =
        requiresManualCourseDetails && trimmedEducatorEmail ? [trimmedEducatorEmail] : undefined;

      const payload = {
        studentId: trimmedStudentId || undefined,
        studentName: trimmedStudentName || undefined,
        courseId: trimmedCourseId,
        comment: form.comment.trim() || undefined,
        studentEmail: trimmedStudentEmail || undefined,
        educatorEmails: educatorEmailsPayload,
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

      if (files.length > 1) {
        setStatusMessage('Zipping contents…');
      } else {
        setStatusMessage('Finalising upload…');
      }

      await completeUploadMutation.mutateAsync({
        submissionId: session.submissionId,
        comment: form.comment.trim() || undefined,
        studentEmail: trimmedStudentEmail || undefined,
        studentName: trimmedStudentName || undefined,
        educatorEmails: educatorEmailsPayload
      });

      setStatusMessage('Processing upload…');

      const completed = await pollSubmissionStatus(session.submissionId);

      setUploadResult(completed);
      toast({
        title: 'Upload complete',
        description: 'Your files were uploaded successfully.'
      });
      setFiles([]);
      setStatusMessage(null);
    } catch (error) {
      let message: string;
      if (axios.isAxiosError(error) && error.response) {
        message = error.response.data?.message ?? 'Server returned an error.';
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = 'Something went wrong while uploading. Please try again.';
      }
      toast({
        title: 'Upload failed',
        description: message,
        variant: 'destructive'
      });
      setStatusMessage(null);
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void uploadFiles();
  };

  if (requireVleReferrer && referrerChecked && !referrerAllowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-12">
        <Card className="bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle>Launch ICEBox from Circle Learn</CardTitle>
            <CardDescription>
              Please access this upload page via Circle Learn (https://my.icecampus.com). If you
              believe you received this message in error, contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
              {displayEntries.map((entry) => {
                const meta = statusMeta[entry.status];
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border bg-background/80 p-4 transition-colors',
                      meta.className
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="line-clamp-1 text-sm font-medium text-foreground sm:text-base">
                          {entry.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.isFolder ? `${entry.fileCount} files` : formatBytes(entry.totalSize)}
                        </p>
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
                          onClick={() => removeFiles(entry.fileIds)}
                          disabled={isUploading}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove {entry.isFolder ? 'folder' : 'file'}</span>
                        </Button>
                      </div>
                    </div>
                    <Progress value={entry.progress} />
                    {entry.status === 'error' && entry.error && (
                      <p className="text-xs text-red-500">{entry.error}</p>
                    )}
                  </li>
                );
              })}
              {displayEntries.length === 0 && (
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
            {statusMessage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            ) : null}
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
            {hasPrefilledContext && (
              <div className="space-y-4">
                {(prefilledStudentName || prefilledStudentEmail || prefilledStudentId) && (
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
                )}
                {prefilledCourseCode && (
                  <div className="rounded-lg border border-border/80 bg-background/80 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Course
                    </p>
                    <p className="mt-2 text-lg font-semibold">{form.courseId || 'Not provided'}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedCourse
                        ? `Files are routed to ${selectedCourse.educatorName ?? 'the assigned educator'} automatically.`
                        : 'We couldn’t match this course in our records. Please confirm the details below.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!prefilledStudentName && (
              <div className="space-y-2">
                <Label htmlFor="studentName">
                  Student name <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="studentName"
                  value={form.studentName}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, studentName: event.target.value }))
                  }
                  placeholder="e.g. Jordan Lee"
                  disabled={isUploading}
                  required
                  aria-required="true"
                  autoComplete="name"
                />
              </div>
            )}

            {!prefilledStudentEmail && (
              <div className="space-y-2">
                <Label htmlFor="studentEmail">
                  Student email <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="studentEmail"
                  value={form.studentEmail}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, studentEmail: event.target.value }))
                  }
                  placeholder="student@example.edu"
                  type="email"
                  disabled={isUploading}
                  required
                  aria-required="true"
                  autoComplete="email"
                />
              </div>
            )}

            {(!prefilledCourseCode || !selectedCourse) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label
                    className="text-sm font-medium text-foreground"
                    htmlFor={courseCodeLabelFor}
                  >
                    Course code <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  {coursesLoading && !coursesError && (
                    <span className="text-xs text-muted-foreground">Loading…</span>
                  )}
                </div>

                {showCourseDropdown && (
                  <Select
                    value={selectValue}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, courseId: value, educatorEmail: '' }))
                    }
                    disabled={isUploading}
                  >
                    <SelectTrigger id="courseIdSelect" aria-label="Course code">
                      <SelectValue placeholder="Select a course code" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseGroups.map(({ name, courses }) => (
                        <SelectGroup key={name}>
                          <SelectLabel>{name}</SelectLabel>
                          {courses.map((course) => (
                            <SelectItem key={course.courseCode} value={course.courseCode}>
                              {course.courseCode}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {!coursesError && !coursesLoading && !courseListAvailable && (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    No courses are configured yet. Enter the course details manually below.
                  </div>
                )}

                {selectedCourse?.courseName && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCourse.courseName}
                    {selectedCourse.educatorName ? ` · Educator: ${selectedCourse.educatorName}` : ''}
                  </p>
                )}

                {prefilledCourseCode && !selectedCourse && !coursesLoading && !coursesError && (
                  <div className="rounded-md border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:border-amber-400/60 dark:bg-amber-400/10 dark:text-amber-300">
                    We couldn&rsquo;t find a saved course for &ldquo;{form.courseId}&rdquo;. Please choose from the list below.
                  </div>
                )}

                {coursesError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    We couldn&rsquo;t load the course list. Enter the course code and educator email manually.
                  </div>
                )}

                {showManualCourseFields && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Input
                        id="manualCourseId"
                        value={form.courseId}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            courseId: event.target.value.toUpperCase()
                          }))
                        }
                        placeholder="e.g. NOV25-PYTHON"
                        disabled={isUploading}
                        required
                        aria-required="true"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="educatorEmail">
                        Educator email <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Input
                        id="educatorEmail"
                        type="email"
                        value={form.educatorEmail}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, educatorEmail: event.target.value }))
                        }
                        placeholder="educator@example.com"
                        disabled={isUploading}
                        required
                        aria-required="true"
                        autoComplete="email"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {!prefilledStudentId && (
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
                  autoComplete="off"
                />
              </div>
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
                {file.downloadUrl ? (
                  <a
                    className="text-xs text-primary underline underline-offset-2"
                    href={file.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download link
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Download link unavailable. Please contact support.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
