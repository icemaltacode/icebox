import { NavLink, Outlet } from 'react-router-dom';
import { Notebook, Users } from 'lucide-react';

import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminAuth } from '@/providers/admin-auth-provider';

const navItems = [
  {
    to: 'assignments',
    icon: Notebook,
    label: 'Course assignments',
    description: 'Manage educator/course mappings'
  },
  {
    to: 'users',
    icon: Users,
    label: 'Admin users',
    description: 'Invite and manage admin access'
  }
] as const;

const AdminNavigation = () => (
  <nav className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-wrap items-center gap-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 transition hover:border-primary hover:bg-primary/10 hover:text-primary',
              isActive && 'border-primary bg-primary/10 text-primary shadow-sm'
            )
          }
        >
          <item.icon className="h-4 w-4" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">{item.label}</span>
            <span className="text-xs text-muted-foreground leading-tight">{item.description}</span>
          </div>
        </NavLink>
      ))}
    </div>
  </nav>
);

export const AdminLayout = () => {
  const { session, signOut, status } = useAdminAuth();

  const primaryLabel = session?.name ?? session?.email ?? session?.username ?? '';
  const secondaryLabel =
    session && (session.email && session.email !== primaryLabel ? session.email : session.username);
  const isAuthenticated = Boolean(session) && status === 'authenticated';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <span className="text-lg font-semibold tracking-tight text-primary drop-shadow-sm sm:text-xl">
            ICEBox Admin
          </span>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{primaryLabel}</p>
                {secondaryLabel ? (
                  <p className="text-xs text-muted-foreground leading-tight">{secondaryLabel}</p>
                ) : null}
              </div>
            ) : null}
            <ModeToggle />
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        {isAuthenticated ? (
          <>
            <AdminNavigation />
            <div className="mt-8">
              <Outlet />
            </div>
          </>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
};
