'use client';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, changeTheme } = useTheme();

  const opts = [
    { id: 'light', Icon: Sun, label: 'Light' },
    { id: 'dark', Icon: Moon, label: 'Dark' },
    { id: 'auto', Icon: Monitor, label: 'Auto' },
  ];

  return (
    <div className="flex w-full rounded-lg border border-[#2C2C2A] bg-[#0A0A0A] p-0.5 gap-0.5" role="group" aria-label="Theme">
      {opts.map(({ id, Icon, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => changeTheme(id)}
            title={`${label} mode`}
            aria-label={`${label} mode`}
            aria-pressed={active}
            className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#39FF14] ${
              active ? 'bg-[rgba(57,255,20,0.12)] text-[#39FF14]' : 'text-[#888780] hover:text-[#C4C4C4]'
            }`}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
