import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpDown,
  BellRing,
  DownloadCloud,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminApi } from '@/hooks/use-admin-api';
import { useToast } from '@/hooks/use-toast';
import type {
  AdminSubmission,
  ListCoursesResponse,
  ListSubmissionsRequest,
  ListSubmissionsResponse
} from '@/lib/admin-api';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PENDING_ARCHIVE: 'Processing',
  COMPLETED: 'Completed',
  ARCHIVE_QUEUE_FAILED: 'Queue failed',
  ARCHIVE_FAILED: 'Archive failed'
};

const SORT_OPTIONS: Array<{ value: ListSubmissionsRequest['sortField']; label: string }> = [
  { value: 'createdAt', label: 'Date uploaded' },
  { value: 'lastAccessedAt', label: 'Last accessed' },
  { value: 'completedAt', label: 'Date processed' },
  { value: 'courseId', label: 'Course code' },
  { value: 'courseName', label: 'Course name' },
  { value: 'educatorName', label: 'Educator name' },
  { value: 'studentName', label: 'Student name' },
  { value: 'status', label: 'Status' },
  { value: 'fileCount', label: 'File count' },
  { value: 'totalSize', label: 'Total size' }
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const formatRelative = (iso: string | null): string => {
  if (!iso) {
    return '';
  }
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) {
    return '';
  }
  const diff = Math.round((target - Date.now()) / DAY_IN_MS);
  if (diff === 0) {
    return 'today';
  }
  if (diff > 0) {
    return `in ${diff} day${diff === 1 ? '' : 's'}`;
  }
  const positive = Math.abs(diff);
  return `${positive} day${positive === 1 ? '' : 's'} ago`;
};

const formatTimeline = (iso: string | null): string => {
  const absolute = formatDateTime(iso);
  const relative = formatRelative(iso);
  return relative ? `${absolute} (${relative})` : absolute;
};

const getStatusLabel = (status: string) => STATUS_LABELS[status] ?? status;

const useDebouncedValue = (value: string, delay = 300) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};

export const AdminSubmissionsPage = () => {
  const adminApi = useAdminApi();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm.trim());

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [accessedFilter, setAccessedFilter] = useState<'viewed' | 'not_viewed' | ''>('');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [sortField, setSortField] = useState<ListSubmissionsRequest['sortField']>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [submissionToDelete, setSubmissionToDelete] = useState<AdminSubmission | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, accessedFilter, courseFilter, sortField, sortOrder, pageSize]);

  const listParams = useMemo<ListSubmissionsRequest>(() => ({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    accessed: accessedFilter || undefined,
    courseId: courseFilter || undefined,
    sortField,
    sortOrder
  }), [page, pageSize, debouncedSearch, statusFilter, accessedFilter, courseFilter, sortField, sortOrder]);

  const queryKey = useMemo(
    () => ['admin', 'submissions', listParams],
    [listParams]
  );

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error
  } = useQuery<ListSubmissionsResponse>({
    queryKey,
    queryFn: () => adminApi.listSubmissions(listParams),
    placeholderData: (previousData) => previousData
  });

  const coursesQuery = useQuery<ListCoursesResponse>({
    queryKey: ['admin', 'courses', 'filters'],
    queryFn: () =>
      adminApi.listCourses({
        page: 1,
        pageSize: 100,
        sortField: 'courseCode',
        sortOrder: 'asc'
      }),
    staleTime: 5 * 60 * 1000
  });

  const remindMutation = useMutation({
    mutationFn: (submissionId: string) => adminApi.remindSubmission(submissionId),
    onSuccess: () => {
      toast({
        title: 'Reminder sent',
        description: 'The educator has been reminded about this submission.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to send reminder',
        description: err instanceof Error ? err.message : 'Could not send the reminder email.',
        variant: 'destructive'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (submissionId: string) => adminApi.deleteSubmission(submissionId),
    onSuccess: () => {
      toast({
        title: 'Submission deleted',
        description: 'The files were removed and the submission archive has been cleared.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete submission',
        description: err instanceof Error ? err.message : 'Could not delete the submission.',
        variant: 'destructive'
      });
    }
  });

  const submissions: AdminSubmission[] = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);

  const isMutating = remindMutation.isPending || deleteMutation.isPending;

  const selectedCourse = coursesQuery.data?.items.find((course) => course.courseCode === courseFilter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor uploaded work, remind educators, and manage archives before lifecycle policies purge them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {selectedCourse ? (
            <span>
              Filtering by course <strong>{selectedCourse.courseCode}</strong>
            </span>
          ) : null}
          {statusFilter ? (
            <span>
              Status <strong>{getStatusLabel(statusFilter)}</strong>
            </span>
          ) : null}
          {accessedFilter ? (
            <span>
              Accessed <strong>{accessedFilter === 'viewed' ? 'Viewed' : 'Not viewed'}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <CardTitle>Filters</CardTitle>
          <CardDescription>Refine the list of submissions or adjust sorting.</CardDescription>
          <CardContent className="-mx-1 flex flex-wrap gap-3 px-0">
            <div className="relative w-full max-w-sm flex-1">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by course, educator, student or file"
                className="pr-10"
              />
              <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="submission-status" className="text-xs uppercase text-muted-foreground">
                Status
              </Label>
              <select
                id="submission-status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-9 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All statuses</option>
                {Object.keys(STATUS_LABELS).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="submission-course" className="text-xs uppercase text-muted-foreground">
                Course
              </Label>
              <select
                id="submission-course"
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                className="h-9 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All courses</option>
                {coursesQuery.data?.items.map((course) => (
                  <option key={course.courseCode} value={course.courseCode}>
                    {course.courseCode}
                    {course.courseName ? ` — ${course.courseName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="submission-access" className="text-xs uppercase text-muted-foreground">
                Accessed
              </Label>
              <select
                id="submission-access"
                value={accessedFilter}
                onChange={(event) => setAccessedFilter(event.target.value as 'viewed' | 'not_viewed' | '')}
                className="h-9 min-w-[140px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All submissions</option>
                <option value="viewed">Viewed</option>
                <option value="not_viewed">Not viewed</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="submission-sort" className="text-xs uppercase text-muted-foreground">
                Sort by
              </Label>
              <div className="flex items-center gap-2">
                <select
                  id="submission-sort"
                  value={sortField ?? 'createdAt'}
                  onChange={(event) => setSortField(event.target.value as ListSubmissionsRequest['sortField'])}
                  className="h-9 min-w-[180px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value ?? 'createdAt'} value={option.value ?? 'createdAt'}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="h-9 w-9"
                  title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <ArrowDownWideNarrow
                    className={cn('h-4 w-4 transition-transform', {
                      'rotate-180': sortOrder === 'asc'
                    })}
                  />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="submission-page-size" className="text-xs uppercase text-muted-foreground">
                Rows
              </Label>
              <select
                id="submission-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10))}
                className="h-9 min-w-[100px] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="self-end"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setAccessedFilter('');
                setCourseFilter('');
                setSortField('createdAt');
                setSortOrder('desc');
                setPageSize(PAGE_SIZE_OPTIONS[0]);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </CardContent>
        </CardHeader>
      </Card>

      <div className="overflow-hidden rounded-lg border">
        <table className="hidden min-w-full divide-y divide-border text-sm lg:table">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Course</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Educator</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Student</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Files</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Timeline</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading submissions…</span>
                  </div>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-destructive">
                  {error instanceof Error ? error.message : 'Failed to load submissions.'}
                </td>
              </tr>
            ) : submissions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No submissions match your filters.
                </td>
              </tr>
            ) : (
              submissions.map((submission) => {
                const canSendReminder = submission.status !== 'DELETED';
                const reminderPending = remindMutation.isPending;
                const deletePending = deleteMutation.isPending &&
                  submissionToDelete?.submissionId === submission.submissionId;
                const timelineItems = [
                  { label: 'Uploaded', value: submission.createdAt },
                  { label: 'Last accessed', value: submission.lastAccessedAt },
                  { label: 'Archive move', value: submission.archiveTransitionAt },
                  { label: 'Lifecycle delete', value: submission.deletionAt }
                ];

                return (
                  <tr key={submission.submissionId} className="align-top">
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{submission.courseId}</div>
                      <div className="text-xs text-muted-foreground">
                        {submission.courseName ?? 'No name configured'}
                      </div>
                      <div className="mt-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {getStatusLabel(submission.status)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">
                        {submission.educatorName ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {submission.educatorEmails.length ? submission.educatorEmails.join(', ') : 'No email recorded'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">
                        {submission.studentName ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {submission.studentEmail ?? 'No email supplied'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {submission.studentId ?? 'No ID'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">
                        {submission.fileCount} file{submission.fileCount === 1 ? '' : 's'}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatBytes(submission.totalSize)}</div>
                      <details className="mt-2 space-y-1 text-xs">
                        <summary className="cursor-pointer text-primary">View files</summary>
                        <ul className="mt-2 space-y-1 text-muted-foreground">
                          {submission.files.map((file) => (
                            <li key={file.objectKey} className="flex items-center gap-2">
                              <DownloadCloud className="h-3 w-3 text-muted-foreground" />
                              <span className="truncate">{file.fileName ?? file.objectKey}</span>
                              <span className="text-[10px] text-muted-foreground/80">
                                {formatBytes(file.size)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <ul className="space-y-1">
                        {timelineItems.map((item) => (
                          <li key={item.label}>
                            <span className="font-semibold text-foreground">{item.label}:</span>{' '}
                            {formatTimeline(item.value)}
                          </li>
                        ))}
                        <li>
                          <span className="font-semibold text-foreground">Reminders sent:</span>{' '}
                          {submission.reminderCount}
                          {submission.lastReminderAt
                            ? ` (last ${formatTimeline(submission.lastReminderAt)})`
                            : ''}
                        </li>
                      </ul>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canSendReminder || reminderPending || deletePending}
                          onClick={() => remindMutation.mutate(submission.submissionId)}
                        >
                          {remindMutation.isPending && canSendReminder ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <BellRing className="mr-2 h-4 w-4" />
                          )}
                          Remind
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletePending || reminderPending}
                          onClick={() => setSubmissionToDelete(submission)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="grid gap-4 p-4 lg:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{error instanceof Error ? error.message : 'Failed to load submissions.'}</span>
            </div>
          ) : submissions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No submissions match your filters.
            </div>
          ) : (
            submissions.map((submission) => (
              <Card key={submission.submissionId} className="border-border">
                <CardHeader className="space-y-1">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>
                      {submission.courseId}
                      {submission.courseName ? ` — ${submission.courseName}` : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3" /> {getStatusLabel(submission.status)}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Uploaded {formatTimeline(submission.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Educator</p>
                    <p className="font-medium text-foreground">{submission.educatorName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {submission.educatorEmails.length ? submission.educatorEmails.join(', ') : 'No email recorded'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Student</p>
                    <p className="font-medium text-foreground">{submission.studentName ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{submission.studentEmail ?? 'No email supplied'}</p>
                    <p className="text-xs text-muted-foreground">{submission.studentId ?? 'No ID'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Files</p>
                    <p className="font-medium text-foreground">
                      {submission.fileCount} • {formatBytes(submission.totalSize)}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {submission.files.map((file) => (
                        <li key={file.objectKey} className="flex items-center gap-2">
                          <DownloadCloud className="h-3 w-3" />
                          <span className="truncate">{file.fileName ?? file.objectKey}</span>
                          <span className="text-[10px] text-muted-foreground/80">{formatBytes(file.size)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-semibold text-foreground">Last accessed</p>
                      <p>{formatTimeline(submission.lastAccessedAt)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Archive move</p>
                      <p>{formatTimeline(submission.archiveTransitionAt)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Lifecycle delete</p>
                      <p>{formatTimeline(submission.deletionAt)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Reminders</p>
                      <p>
                        {submission.reminderCount}
                        {submission.lastReminderAt
                          ? ` (last ${formatTimeline(submission.lastReminderAt)})`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant="outline"
                      size="sm"
                      disabled={remindMutation.isPending || deleteMutation.isPending}
                      onClick={() => remindMutation.mutate(submission.submissionId)}
                    >
                      {remindMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <BellRing className="mr-2 h-4 w-4" />
                      )}
                      Remind
                    </Button>
                    <Button
                      className="flex-1"
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending || remindMutation.isPending}
                      onClick={() => setSubmissionToDelete(submission)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>
          Showing {startItem}–{endItem} of {totalCount} submissions
          {isFetching ? ' · Updating…' : ''}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1 || isMutating}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages || isMutating}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(submissionToDelete)} onOpenChange={() => setSubmissionToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete submission</DialogTitle>
            <DialogDescription>
              This will immediately remove all stored files and mark the submission as deleted. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-semibold">Course:</span> {submissionToDelete?.courseId}
              {submissionToDelete?.courseName ? ` — ${submissionToDelete.courseName}` : ''}
            </p>
            <p>
              <span className="font-semibold">Student:</span>{' '}
              {submissionToDelete?.studentName ?? submissionToDelete?.studentEmail ?? 'Unknown'}
            </p>
            <p>
              <span className="font-semibold">Files:</span> {submissionToDelete?.fileCount} •{' '}
              {formatBytes(submissionToDelete?.totalSize)}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubmissionToDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (submissionToDelete) {
                  deleteMutation.mutate(submissionToDelete.submissionId, {
                    onSuccess: () => setSubmissionToDelete(null),
                    onError: () => setSubmissionToDelete(null)
                  });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
