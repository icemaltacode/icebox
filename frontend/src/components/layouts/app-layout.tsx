import { Outlet } from 'react-router-dom';

import { ModeToggle } from '@/components/mode-toggle';

const Logo = () => (
  <span className="text-lg font-semibold tracking-tight text-primary drop-shadow-sm sm:text-xl">
    ICEBox
  </span>
);

export const AppLayout = () => (
  <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-card/60 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-8">
        <Logo />
        <ModeToggle />
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
      <Outlet />
    </main>
  </div>
);
