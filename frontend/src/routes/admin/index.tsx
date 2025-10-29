import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Outlet } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  EllipsisVertical,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus
} from 'lucide-react';
import axios from 'axios';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminApi } from '@/hooks/use-admin-api';
import { useToast } from '@/hooks/use-toast';
import type {
  CourseAssignment,
  InviteAdminUserPayload,
  SaveCoursePayload,
  UpdateAdminUserPayload,
  AdminUser,
  ListCoursesResponse,
  ListAdminUsersResponse
} from '@/lib/admin-api';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/providers/admin-auth-provider';

type SortField = 'courseCode' | 'courseName' | 'educatorName' | 'educatorEmail';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const sortLabels: Record<SortField, string> = {
  courseCode: 'Course code',
  courseName: 'Course name',
  educatorName: 'Educator name',
  educatorEmail: 'Educator email'
};

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message =
      (error.response?.data as { message?: string } | undefined)?.message ?? error.message;
    return message || 'Something went wrong';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
};

const LoginView = () => {
  const { signIn, status } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const isSubmitting = status === 'loading';

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Admin area</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with the credentials sent to you via email.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Admin sign-in</CardTitle>
          <CardDescription>Access course assignments and educator management tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const NewPasswordView = () => {
  const { completeNewPassword, status } = useAdminAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.trim().length === 0) {
      setError('Please enter a new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    try {
      await completeNewPassword(password);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const isSubmitting = status === 'loading';

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your first login requires creating a new password. Please choose a strong passphrase.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Complete account setup</CardTitle>
          <CardDescription>
            Enter a new password to finish activating your admin access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="admin-new-password">New password</Label>
              <Input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-confirm-password">Confirm password</Label>
              <Input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Passwords must be at least 12 characters and include upper and lowercase letters,
              numbers and symbols.
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSubmitting ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const CourseAssignmentsView = () => {
  const adminApi = useAdminApi();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [sortField, setSortField] = useState<SortField>('courseCode');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseAssignment | null>(null);
  const [courseToDelete, setCourseToDelete] = useState<CourseAssignment | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sortField, sortOrder, pageSize]);

  const queryKey = useMemo(
    () => [
      'admin',
      'courses',
      { page, pageSize, search: debouncedSearch, sortField, sortOrder }
    ],
    [page, pageSize, debouncedSearch, sortField, sortOrder]
  );

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error
  } = useQuery<ListCoursesResponse>({
    queryKey,
    queryFn: () =>
      adminApi.listCourses({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        sortField,
        sortOrder
      }),
    placeholderData: (previousData) => previousData
  });

  const createMutation = useMutation({
    mutationFn: adminApi.createCourse,
    onSuccess: () => {
      toast({
        title: 'Assignment created',
        description: 'The course has been added successfully.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to create assignment',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ courseCode, payload }: { courseCode: string; payload: Omit<SaveCoursePayload, 'courseCode'> }) =>
      adminApi.updateCourse(courseCode, payload),
    onSuccess: () => {
      toast({
        title: 'Assignment updated',
        description: 'Changes saved successfully.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to update assignment',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (courseCode: string) => adminApi.deleteCourse(courseCode),
    onSuccess: () => {
      toast({
        title: 'Assignment deleted',
        description: 'The course assignment has been removed.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete assignment',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortOrder('asc');
  };

  const totalItems = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);

  const handleCreateClick = () => {
    setEditingCourse(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (course: CourseAssignment) => {
    setEditingCourse(course);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (payload: SaveCoursePayload) => {
    if (editingCourse) {
      await updateMutation.mutateAsync({
        courseCode: editingCourse.courseCode,
        payload: {
          courseName: payload.courseName,
          educatorName: payload.educatorName,
          educatorEmail: payload.educatorEmail
        }
      });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setIsFormOpen(false);
  };

  const handleDeleteConfirm = async () => {
    if (!courseToDelete) {
      return;
    }
    await deleteMutation.mutateAsync(courseToDelete.courseCode);
    setCourseToDelete(null);
  };

  const mutationInFlight =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by code, course or educator"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-page-size" className="text-sm text-muted-foreground">
              Rows:
            </label>
            <select
              id="admin-page-size"
              value={pageSize}
              onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button onClick={handleCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          New assignment
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              {(Object.keys(sortLabels) as SortField[]).map((field) => (
                <th key={field} className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleSort(field)}
                    className="flex items-center gap-1"
                  >
                    <span>{sortLabels[field]}</span>
                    <ArrowUpDown
                      className={cn('h-4 w-4 text-muted-foreground', {
                        'text-primary': sortField === field,
                        'rotate-180 text-primary': sortField === field && sortOrder === 'desc'
                      })}
                    />
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading assignments…</span>
                  </div>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-destructive">
                  {getErrorMessage(error)}
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No assignments found. Try adjusting your search or add a new assignment.
                </td>
              </tr>
            ) : (
              data?.items.map((course) => (
                <tr key={course.courseCode}>
                  <td className="px-4 py-3 font-medium">{course.courseCode}</td>
                  <td className="px-4 py-3">{course.courseName}</td>
                  <td className="px-4 py-3">{course.educatorName}</td>
                  <td className="px-4 py-3">{course.educatorEmail}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEditClick(course)}
                        className="h-8 w-8"
                      >
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => setCourseToDelete(course)}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startItem}–{endItem} of {totalItems} assignments
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page === 1 || isLoading || mutationInFlight}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages || isLoading || mutationInFlight}
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingCourse(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCourse ? 'Edit assignment' : 'New assignment'}</DialogTitle>
            <DialogDescription>
              {editingCourse
                ? 'Update the educator details for this course.'
                : 'Create a new course assignment.'}
            </DialogDescription>
          </DialogHeader>
          <CourseForm
            initialValues={editingCourse}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingCourse(null);
            }}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(courseToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setCourseToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete assignment</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The course assignment will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {courseToDelete ? (
              <>
                Are you sure you want to delete{' '}
                <span className="font-medium">{courseToDelete.courseCode}</span> (
                {courseToDelete.courseName})?
              </>
            ) : null}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCourseToDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isFetching ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Updating…</span>
        </div>
      ) : null}
    </div>
  );
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type CourseFormProps = {
  initialValues: CourseAssignment | null;
  onSubmit: (values: SaveCoursePayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
};

const CourseForm = ({ initialValues, onSubmit, onCancel, isSubmitting }: CourseFormProps) => {
  const isEditing = Boolean(initialValues);
  const [courseCode, setCourseCode] = useState(initialValues?.courseCode ?? '');
  const [courseName, setCourseName] = useState(initialValues?.courseName ?? '');
  const [educatorName, setEducatorName] = useState(initialValues?.educatorName ?? '');
  const [educatorEmail, setEducatorEmail] = useState(initialValues?.educatorEmail ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCourseCode(initialValues?.courseCode ?? '');
    setCourseName(initialValues?.courseName ?? '');
    setEducatorName(initialValues?.educatorName ?? '');
    setEducatorEmail(initialValues?.educatorEmail ?? '');
    setError(null);
  }, [initialValues]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedCode = courseCode.trim();
    const trimmedCourseName = courseName.trim();
    const trimmedEducatorName = educatorName.trim();
    const trimmedEmail = educatorEmail.trim().toLowerCase();

    if (!trimmedCode) {
      setError('Course code is required.');
      return;
    }
    if (!trimmedCourseName) {
      setError('Course name is required.');
      return;
    }
    if (!trimmedEducatorName) {
      setError('Educator name is required.');
      return;
    }
    if (!trimmedEmail || !emailPattern.test(trimmedEmail)) {
      setError('Please enter a valid educator email address.');
      return;
    }

    setError(null);
    const payload: SaveCoursePayload = {
      courseCode: trimmedCode,
      courseName: trimmedCourseName,
      educatorName: trimmedEducatorName,
      educatorEmail: trimmedEmail
    };

    try {
      await onSubmit(payload);
      setCourseName('');
      setCourseCode('');
      setEducatorName('');
      setEducatorEmail('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="course-code">Course code</Label>
        <Input
          id="course-code"
          value={courseCode}
          onChange={(event) => setCourseCode(event.target.value)}
          placeholder="e.g. JUN25-PYTHON"
          disabled={isEditing}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="course-name">Course name</Label>
        <Input
          id="course-name"
          value={courseName}
          onChange={(event) => setCourseName(event.target.value)}
          placeholder="Python Programming Foundations"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="educator-name">Educator name</Label>
        <Input
          id="educator-name"
          value={educatorName}
          onChange={(event) => setEducatorName(event.target.value)}
          placeholder="Jane Smith"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="educator-email">Educator email</Label>
        <Input
          id="educator-email"
          type="email"
          value={educatorEmail}
          onChange={(event) => setEducatorEmail(event.target.value)}
          placeholder="jane.smith@example.com"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isEditing ? 'Save changes' : 'Create assignment'}
        </Button>
      </DialogFooter>
    </form>
  );
};

export const AdminAssignmentsPage = () => (
  <div className="space-y-8">
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Course assignments</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage the mapping between courses and their assigned educators.
      </p>
    </div>
    <CourseAssignmentsView />
  </div>
);

export const AdminUsersPage = () => {
  const adminApi = useAdminApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteGivenName, setInviteGivenName] = useState('');
  const [inviteFamilyName, setInviteFamilyName] = useState('');
  const [inviteName, setInviteName] = useState('');
  const inviteAutoNameRef = useRef('');
  const inviteNameOverrideRef = useRef(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editGivenName, setEditGivenName] = useState('');
  const [editFamilyName, setEditFamilyName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [userToReset, setUserToReset] = useState<AdminUser | null>(null);

  const limit = 20;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setHistory([]);
    setCurrentToken(null);
  }, [debouncedSearch]);

  useEffect(() => {
    if (editingUser) {
      setEditName(editingUser.name ?? '');
      setEditGivenName(editingUser.givenName ?? '');
      setEditFamilyName(editingUser.familyName ?? '');
      setEditError(null);
    } else {
      setEditName('');
      setEditGivenName('');
      setEditFamilyName('');
      setEditError(null);
    }
  }, [editingUser]);

  useEffect(() => {
    const trimmedGiven = inviteGivenName.trim();
    const trimmedFamily = inviteFamilyName.trim();
    const combined = `${trimmedGiven} ${trimmedFamily}`.replace(/\s+/g, ' ').trim();
    const previousAuto = inviteAutoNameRef.current.trim();
    inviteAutoNameRef.current = combined;

    if (!combined) {
      if (!inviteNameOverrideRef.current && inviteName !== '') {
        setInviteName('');
      }
      return;
    }

    const currentDisplay = inviteName.trim();
    const shouldAutofill =
      !inviteNameOverrideRef.current || currentDisplay === previousAuto;

    if (shouldAutofill && inviteName !== combined) {
      inviteNameOverrideRef.current = false;
      setInviteName(combined);
    }
  }, [inviteGivenName, inviteFamilyName, inviteName]);

  const queryKey = useMemo(
    () => ['admin', 'users', { search: debouncedSearch, token: currentToken, limit }],
    [debouncedSearch, currentToken, limit]
  );

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error
  } = useQuery<ListAdminUsersResponse>({
    queryKey,
    queryFn: () =>
      adminApi.listAdminUsers({
        search: debouncedSearch || undefined,
        nextToken: currentToken ?? undefined,
        limit
      }),
    placeholderData: (previousData) => previousData
  });

  const inviteMutation = useMutation<unknown, unknown, InviteAdminUserPayload>({
    mutationFn: adminApi.inviteAdminUser,
    onSuccess: (_result, variables) => {
      toast({
        title: variables?.resend ? 'Invite resent' : 'Invite sent',
        description: variables?.email
          ? `An email has been sent to ${variables.email}.`
          : 'Invitation email sent.'
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      if (!variables?.resend) {
        setIsInviteOpen(false);
        setInviteEmail('');
        setInviteGivenName('');
        setInviteFamilyName('');
        setInviteName('');
        inviteAutoNameRef.current = '';
        inviteNameOverrideRef.current = false;
        setInviteError(null);
      }
    },
    onError: (err, variables) => {
      toast({
        title: variables?.resend ? 'Failed to resend invite' : 'Failed to send invite',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const resendMutation = useMutation<unknown, unknown, string>({
    mutationFn: (email: string) => adminApi.inviteAdminUser({ email, resend: true }),
    onSuccess: (_result, email) => {
      toast({
        title: 'Invite resent',
        description: `A new invitation has been sent to ${email}.`
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => {
      toast({
        title: 'Failed to resend invite',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const updateUserMutation = useMutation<
    unknown,
    unknown,
    { username: string; payload: UpdateAdminUserPayload }
  >({
    mutationFn: ({ username, payload }) => adminApi.updateAdminUser(username, payload),
    onSuccess: (_result, variables) => {
      toast({
        title: 'User updated',
        description: `Changes saved for ${variables.username}.`
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditingUser(null);
    },
    onError: (err) => {
      toast({
        title: 'Failed to update user',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const resetPasswordMutation = useMutation<unknown, unknown, AdminUser>({
    mutationFn: (user) => adminApi.resetAdminUserPassword(user.username),
    onSuccess: (_result, user) => {
      toast({
        title: 'Password reset email sent',
        description: `A reset link has been sent to ${user.email ?? user.username}.`
      });
      setUserToReset(null);
    },
    onError: (err) => {
      toast({
        title: 'Failed to reset password',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const deleteUserMutation = useMutation<unknown, unknown, AdminUser>({
    mutationFn: (user) => adminApi.deleteAdminUser(user.username),
    onSuccess: (_result, user) => {
      toast({
        title: 'Admin removed',
        description: `${user.email ?? user.username} no longer has access.`
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setUserToDelete(null);
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete admin',
        description: getErrorMessage(err),
        variant: 'destructive'
      });
    }
  });

  const users = data?.items ?? [];
  const hasNext = Boolean(data?.nextToken);
  const hasPrevious = history.length > 0;

  const formatDateTime = (value?: string) => {
    if (!value) {
      return '—';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '—';
    }
    return parsed.toLocaleString();
  };

  const statusConfig: Record<
    string,
    { label: string; className: string }
  > = {
    CONFIRMED: {
      label: 'Confirmed',
      className: 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-300'
    },
    FORCE_CHANGE_PASSWORD: {
      label: 'Temp password',
      className: 'border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-300'
    },
    UNCONFIRMED: {
      label: 'Unconfirmed',
      className: 'border-rose-500 text-rose-600 dark:border-rose-400 dark:text-rose-300'
    }
  };

  const formatStatus = (status: string | null) => statusConfig[status ?? '']?.label ?? 'Unknown';

  const handleNext = () => {
    if (!data?.nextToken) {
      return;
    }
    setHistory((prev) => [...prev, currentToken]);
    setCurrentToken(data.nextToken ?? null);
  };

  const handlePrevious = () => {
    setHistory((prev) => {
      if (prev.length === 0) {
        setCurrentToken(null);
        return prev;
      }
      const newHistory = prev.slice(0, -1);
      const previousToken = prev[prev.length - 1] ?? null;
      setCurrentToken(previousToken);
      return newHistory;
    });
  };

  const handleInviteSubmit = (event: FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError('Email is required.');
      return;
    }

    setInviteError(null);
    inviteMutation.mutate({
      email,
      givenName: inviteGivenName.trim() || undefined,
      familyName: inviteFamilyName.trim() || undefined,
      name: inviteName.trim() || undefined
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsInviteOpen(open);
    if (!open) {
      setInviteError(null);
      setInviteEmail('');
      setInviteGivenName('');
      setInviteFamilyName('');
      setInviteName('');
      inviteAutoNameRef.current = '';
      inviteNameOverrideRef.current = false;
    }
  };

  const resendPendingEmail = resendMutation.variables;

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser) {
      return;
    }
    const trimmedName = editName.trim();
    const trimmedGivenName = editGivenName.trim();
    const trimmedFamilyName = editFamilyName.trim();

    if (!trimmedName && !trimmedGivenName && !trimmedFamilyName) {
      setEditError('Please provide at least one value to update.');
      return;
    }

    setEditError(null);
    updateUserMutation.mutate({
      username: editingUser.username,
      payload: {
        name: trimmedName || undefined,
        givenName: trimmedGivenName || undefined,
        familyName: trimmedFamilyName || undefined
      }
    });
  };

  const handleResetConfirm = () => {
    if (!userToReset) {
      return;
    }
    resetPasswordMutation.mutate(userToReset);
  };

  const handleDeleteConfirm = () => {
    if (!userToDelete) {
      return;
    }
    deleteUserMutation.mutate(userToDelete);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Admin users</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Invite colleagues to the admin console, track their status, and resend onboarding emails.
          </p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite admin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filter by email"
                className="pl-9"
                aria-label="Filter admin users by email"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {isFetching ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing…
                </span>
              ) : (
                <span>
                  {users.length} user{users.length === 1 ? '' : 's'} on this page
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading admin users…
              </span>
            </div>
          ) : isError ? (
            <div className="flex h-48 items-center justify-center text-sm text-destructive">
              {getErrorMessage(error)}
            </div>
          ) : users.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No admin users found.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {users.map((user) => {
                    const email = user.email ?? user.username;
                    const canResend =
                      (user.status === 'FORCE_CHANGE_PASSWORD' || user.status === 'UNCONFIRMED') &&
                      Boolean(email);
                    const isResending = resendMutation.isPending && resendPendingEmail === email;
                    const inferredName = `${user.givenName ?? ''} ${user.familyName ?? ''}`.trim();
                    const displayName = (user.name ?? inferredName) || '—';

                    return (
                      <tr key={user.username}>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{email}</span>
                            <span className="text-xs text-muted-foreground">{user.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span>{displayName}</span>
                            {user.emailVerified ? (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                Email verified
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Email pending</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                              statusConfig[user.status ?? '']?.className ?? 'border-border text-muted-foreground'
                            )}
                          >
                            {formatStatus(user.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{formatDateTime(user.createdAt)}</td>
                        <td className="px-4 py-3">{formatDateTime(user.updatedAt)}</td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" className="h-8 w-8">
                                {isResending ||
                                (resetPasswordMutation.isPending &&
                                  resetPasswordMutation.variables?.username === user.username) ||
                                (deleteUserMutation.isPending &&
                                  deleteUserMutation.variables?.username === user.username) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <EllipsisVertical className="h-4 w-4" />
                                )}
                                <span className="sr-only">Admin actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setEditingUser(user);
                                }}
                              >
                                <Edit3 className="mr-2 h-4 w-4" />
                                Edit details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canResend || isResending}
                                onSelect={(event) => {
                                  event.preventDefault();
                                  if (email) {
                                    resendMutation.mutate(email);
                                  }
                                }}
                              >
                                {isResending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Resend invite
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setUserToReset(user);
                                }}
                              >
                                <KeyRound className="mr-2 h-4 w-4" />
                                Reset password
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={(event) => {
                                  event.preventDefault();
                                  setUserToDelete(user);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete admin
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {users.length} user{users.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={!hasPrevious || isLoading || isFetching || inviteMutation.isPending}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={!hasNext || isLoading || isFetching || inviteMutation.isPending}
              >
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isInviteOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a new admin</DialogTitle>
            <DialogDescription>
              We&rsquo;ll email them a temporary password that they can complete on first login.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-given-name">Given name (optional)</Label>
                <Input
                  id="invite-given-name"
                  value={inviteGivenName}
                  onChange={(event) => setInviteGivenName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-family-name">Family name (optional)</Label>
                <Input
                  id="invite-family-name"
                  value={inviteFamilyName}
                  onChange={(event) => setInviteFamilyName(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-display-name">Display name (optional)</Label>
              <Input
                id="invite-display-name"
                value={inviteName}
                onChange={(event) => {
                  const value = event.target.value;
                  inviteNameOverrideRef.current = value.trim().length > 0;
                  setInviteName(value);
                }}
                placeholder="e.g. Jane Smith"
              />
            </div>
            {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={inviteMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit admin details</DialogTitle>
            <DialogDescription>
              Update the display name fields for {editingUser?.email ?? editingUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Display name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="The full name shown in emails"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-given-name">Given name</Label>
                <Input
                  id="edit-given-name"
                  value={editGivenName}
                  onChange={(event) => setEditGivenName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-family-name">Family name</Label>
                <Input
                  id="edit-family-name"
                  value={editFamilyName}
                  onChange={(event) => setEditFamilyName(event.target.value)}
                />
              </div>
            </div>
            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
                disabled={updateUserMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Edit3 className="mr-2 h-4 w-4" />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(userToReset)}
        onOpenChange={(open) => {
          if (!open) {
            setUserToReset(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset admin password</DialogTitle>
            <DialogDescription>
              We&rsquo;ll email a temporary password to{' '}
              {userToReset?.email ?? userToReset?.username}. They&rsquo;ll be prompted to choose a
              new password on their next sign in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUserToReset(null)}
              disabled={resetPasswordMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleResetConfirm}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              Send reset email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete admin</DialogTitle>
            <DialogDescription>
              This will remove access for {userToDelete?.email ?? userToDelete?.username}. They will
              no longer be able to sign in until invited again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUserToDelete(null)}
              disabled={deleteUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const AdminGate = () => {
  const { status } = useAdminAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading admin tools…</span>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginView />;
  }

  if (status === 'challenge') {
    return <NewPasswordView />;
  }

  return <Outlet />;
};
