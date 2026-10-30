import { useState } from 'react';
import { Button } from './Button';
import { IconCheck, IconCopy } from './Icons';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'outline' }: { text: string; label?: string; size?: 'sm' | 'md'; variant?: 'outline' | 'ghost' | 'primary' }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      disabled={!text}
      icon={copied ? <IconCheck className="h-4 w-4 text-emerald-500" /> : <IconCopy />}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}
