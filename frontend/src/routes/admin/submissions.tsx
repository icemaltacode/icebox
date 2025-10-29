import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpDown,
  BellRing,
  CalendarClock,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
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
  ACCESSED: 'Accessed',
  UPLOADED: 'Uploaded',
  ERROR: 'Error'
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

const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
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
  const absolute = formatDate(iso);
  const relative = formatRelative(iso);
  return relative ? `${absolute} (${relative})` : absolute;
};

const resolveStatusMeta = (submission: AdminSubmission) => {
  if (
    submission.status === 'ARCHIVE_QUEUE_FAILED' ||
    submission.status === 'ARCHIVE_FAILED'
  ) {
    return {
      label: submission.status.replaceAll('_', ' '),
      className: 'border-destructive text-destructive',
      icon: AlertTriangle
    };
  }

  if (submission.lastAccessedAt) {
    return {
      label: STATUS_LABELS.ACCESSED,
      className: 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-300',
      icon: FileText
    };
  }

  return {
    label: STATUS_LABELS.UPLOADED,
    className: 'border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-300',
    icon: Upload
  };
};

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
    accessed: accessedFilter || undefined,
    courseId: courseFilter || undefined,
    sortField,
    sortOrder
  }), [page, pageSize, debouncedSearch, accessedFilter, courseFilter, sortField, sortOrder]);

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

  const rawSubmissions: AdminSubmission[] = data?.items ?? [];
  const filteredSubmissions = rawSubmissions.filter((submission) => {
    if (statusFilter === 'accessed' && !submission.lastAccessedAt) {
      return false;
    }

    if (
      statusFilter === 'uploaded' &&
      (submission.lastAccessedAt ||
        submission.status === 'ARCHIVE_QUEUE_FAILED' ||
        submission.status === 'ARCHIVE_FAILED')
    ) {
      return false;
    }

    if (
      statusFilter === 'error' &&
      submission.status !== 'ARCHIVE_QUEUE_FAILED' &&
      submission.status !== 'ARCHIVE_FAILED'
    ) {
      return false;
    }

    return true;
  });

  const submissions = filteredSubmissions;
  const pageItemCount = submissions.length;
  const totalCount = data?.totalCount ?? pageItemCount;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(totalCount / pageSize));
  const displayStart = pageItemCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const displayEnd = pageItemCount === 0 ? 0 : displayStart + pageItemCount - 1;
  const displayTotal = (statusFilter || accessedFilter || courseFilter) ? pageItemCount : totalCount;

  const filtersApplied = Boolean(
    searchTerm.trim() ||
      statusFilter ||
      accessedFilter ||
      courseFilter ||
      sortField !== 'createdAt' ||
      sortOrder !== 'desc' ||
      pageSize !== PAGE_SIZE_OPTIONS[0]
  );

  const isMutating = remindMutation.isPending || deleteMutation.isPending;

  const selectedCourse = coursesQuery.data?.items.find((course) => course.courseCode === courseFilter);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Submissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor uploaded work, remind educators, and manage archives before lifecycle policies purge them.
          </p>
        </div>
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by course, educator, student or file"
          className="max-w-lg"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {selectedCourse ? (
            <span>
              Filtering by course <strong>{selectedCourse.courseCode}</strong>
            </span>
          ) : null}
          {statusFilter ? (
            <span>
              Status <strong>{statusFilter === 'accessed' ? 'Accessed' : statusFilter === 'uploaded' ? 'Uploaded' : 'Errors'}</strong>
            </span>
          ) : null}
          {accessedFilter ? (
            <span>
              Accessed <strong>{accessedFilter === 'viewed' ? 'Viewed' : 'Not viewed'}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <Card className="relative">
        <CardHeader className="space-y-4 pr-12">
          <CardTitle>Filters</CardTitle>
          <CardDescription>Refine the list of submissions or adjust sorting.</CardDescription>
        </CardHeader>
        {filtersApplied ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-4 h-8 w-8"
                  onClick={() => {
                    setStatusFilter('');
                    setAccessedFilter('');
                    setCourseFilter('');
                    setSortField('createdAt');
                    setSortOrder('desc');
                    setPageSize(PAGE_SIZE_OPTIONS[0]);
                    setPage(1);
                    setSearchTerm('');
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>Reset filters</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <CardContent className="flex flex-wrap gap-3 px-4 pb-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Status</Label>
            <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="min-w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Status</SelectLabel>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="accessed">Accessed</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Course</Label>
            <Select value={courseFilter || 'all'} onValueChange={(value) => setCourseFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="min-w-[220px]">
                <SelectValue placeholder="All courses" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel>Courses</SelectLabel>
                  <SelectItem value="all">All courses</SelectItem>
                  {coursesQuery.data?.items.map((course) => (
                    <SelectItem key={course.courseCode} value={course.courseCode}>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{course.courseCode}</span>
                        <span className="text-xs text-muted-foreground">
                          {course.courseName ?? 'Unnamed course'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Accessed</Label>
              <Select
                value={accessedFilter || 'all'}
                onValueChange={(value) =>
                  setAccessedFilter(value === 'all' ? '' : (value as 'viewed' | 'not_viewed'))
                }
              >
                <SelectTrigger className="min-w-[160px]">
                  <SelectValue placeholder="All submissions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Accessed</SelectLabel>
                    <SelectItem value="all">All submissions</SelectItem>
                    <SelectItem value="viewed">Viewed</SelectItem>
                    <SelectItem value="not_viewed">Not viewed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Sort by</Label>
            <Select
              value={sortField ?? 'createdAt'}
              onValueChange={(value) => setSortField(value as ListSubmissionsRequest['sortField'])}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Sort by</SelectLabel>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value ?? 'createdAt'} value={option.value ?? 'createdAt'}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
              className="h-9 w-9"
            >
              <ArrowUpDown className={cn('h-4 w-4 transition-transform', { 'rotate-180': sortOrder === 'asc' })} />
            </Button>
            <div className="flex flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Rows</Label>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number.parseInt(value, 10))}
              >
                <SelectTrigger className="min-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Rows</SelectLabel>
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
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
                const statusMeta = resolveStatusMeta(submission);
                const canSendReminder = submission.status !== 'DELETED';
                const reminderPending = remindMutation.isPending;
                const deletePending =
                  deleteMutation.isPending &&
                  submissionToDelete?.submissionId === submission.submissionId;
                const timelineItems = [
                  { label: 'Uploaded', value: submission.createdAt, icon: Upload },
                  {
                    label: 'Last accessed',
                    value: submission.lastAccessedAt,
                    icon: Clock3
                  },
                  {
                    label: 'Archive move',
                    value: submission.archiveTransitionAt,
                    icon: CalendarClock
                  },
                  {
                    label: 'Lifecycle delete',
                    value: submission.deletionAt,
                    icon: Trash2
                  }
                ];

                return (
                  <tr
                    key={submission.submissionId}
                    className="align-top transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 py-4">
                      <div className="font-medium text-foreground">{submission.courseId}</div>
                      <div className="text-xs text-muted-foreground">
                        {submission.courseName ?? 'No name configured'}
                      </div>
                      <div
                        className={cn(
                          'mt-2 inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs',
                          statusMeta.className
                        )}
                        title={statusMeta.label}
                      >
                        <statusMeta.icon className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">{statusMeta.label}</span>
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
                        <a
                          href={submission.files[0]?.downloadToken && submission.downloadBaseUrl
                            ? `${submission.downloadBaseUrl}/downloads/${submission.submissionId}/${submission.files[0].downloadToken}`
                            : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Download
                        </a>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatBytes(submission.totalSize)}</div>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-3">
                        {timelineItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.label}
                              className="flex items-start gap-2"
                              title={item.label}
                            >
                              <Icon className="mt-0.5 h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">{item.label}</span>
                              <span className="text-xs text-muted-foreground">{formatTimeline(item.value)}</span>
                            </div>
                          );
                        })}
                        {submission.reminderCount > 0 && (
                          <div className="flex items-start gap-2" title="Reminders sent">
                            <BellRing className="mt-0.5 h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">Reminders sent</span>
                            <span className="text-xs text-muted-foreground">
                              {submission.reminderCount}
                              {submission.lastReminderAt
                                ? ` (last ${formatTimeline(submission.lastReminderAt)})`
                                : ''}
                            </span>
                          </div>
                        )}
                      </div>
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
            submissions.map((submission) => {
              const statusMeta = resolveStatusMeta(submission);
              const timelineItems = [
                { label: 'Uploaded', value: submission.createdAt, icon: Upload },
                {
                  label: 'Last accessed',
                  value: submission.lastAccessedAt,
                  icon: Clock3
                },
                {
                  label: 'Archive move',
                  value: submission.archiveTransitionAt,
                  icon: CalendarClock
                },
                {
                  label: 'Lifecycle delete',
                  value: submission.deletionAt,
                  icon: Trash2
                }
              ];

              return (
                <Card key={submission.submissionId} className="border-border">
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>
                        {submission.courseId}
                        {submission.courseName ? ` — ${submission.courseName}` : ''}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                          statusMeta.className
                        )}
                        title={statusMeta.label}
                      >
                        <statusMeta.icon className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">{statusMeta.label}</span>
                      </span>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 text-xs" title="Uploaded">
                      <Upload className="h-3 w-3" aria-hidden="true" />
                      <span>{formatTimeline(submission.createdAt)}</span>
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
                        <a
                          href={submission.files[0]?.downloadToken && submission.downloadBaseUrl
                            ? `${submission.downloadBaseUrl}/downloads/${submission.submissionId}/${submission.files[0].downloadToken}`
                            : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Download
                        </a>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatBytes(submission.totalSize)}</p>
                    </div>
                    <div className="flex flex-col gap-3 text-xs text-muted-foreground">
                      {timelineItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className="flex items-start gap-2" title={item.label}>
                            <Icon className="mt-0.5 h-3 w-3" aria-hidden="true" />
                            <span className="sr-only">{item.label}</span>
                            <span>{formatTimeline(item.value)}</span>
                          </div>
                        );
                      })}
                      {submission.reminderCount > 0 && (
                        <div className="flex items-start gap-2" title="Reminders sent">
                          <BellRing className="mt-0.5 h-3 w-3" aria-hidden="true" />
                          <span className="sr-only">Reminders sent</span>
                          <span>
                            {submission.reminderCount}
                            {submission.lastReminderAt
                              ? ` (last ${formatTimeline(submission.lastReminderAt)})`
                              : ''}
                          </span>
                        </div>
                      )}
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
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div>
          Showing {displayStart}–{displayEnd} of {displayTotal} submissions
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
