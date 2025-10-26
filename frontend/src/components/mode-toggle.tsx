import { useEffect, useState } from 'react';
import { Laptop, MoonStar, SunMedium } from 'lucide-react';

import { useTheme } from './theme-provider';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './ui/dropdown-menu';

const THEME_LABELS = {
  light: 'Light',
  dark: 'Dark',
  system: 'System'
} as const;

const THEME_ICONS: Record<'light' | 'dark' | 'system', JSX.Element> = {
  light: <SunMedium className="h-4 w-4" />,
  dark: <MoonStar className="h-4 w-4" />,
  system: <Laptop className="h-4 w-4" />
};

export const ModeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const resolved = theme === 'system' ? 'system' : theme;

  const icon =
    resolved === 'system'
      ? THEME_ICONS.system
      : resolved === 'dark'
        ? THEME_ICONS.dark
        : THEME_ICONS.light;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-border hover:border-primary hover:bg-primary/10"
          aria-label="Toggle theme"
        >
          {mounted ? icon : THEME_ICONS.system}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {(['light', 'dark', 'system'] as const).map((option) => (
          <DropdownMenuItem key={option} onClick={() => setTheme(option)}>
            <div className="flex items-center gap-3">
              {THEME_ICONS[option]}
              <span className="text-sm font-medium">{THEME_LABELS[option]}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
