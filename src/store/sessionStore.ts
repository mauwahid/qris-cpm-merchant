import { create } from 'zustand';
import type { ParsedQr, Transaction, ValidationResult } from '@/core/types';

export type ScanSource = 'CAMERA' | 'UPLOAD' | 'MANUAL' | 'SAMPLE' | 'SCENARIO';

interface SessionState {
  parsed?: ParsedQr;
  source?: ScanSource;
  validation?: ValidationResult;
  validating: boolean;
  validationError?: string;
  amount: number;
  processing: boolean;
  currentTransaction?: Transaction;
  lastTransaction?: Transaction;
  /** payloadHash → ISO timestamp of first scan (for validity window expiry). */
  firstSeen: Record<string, string>;
  set: (p: Partial<SessionState>) => void;
  clearCurrent: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  validating: false,
  processing: false,
  amount: 0,
  firstSeen: {},
  set: (p) => set(p),
  clearCurrent: () =>
    set({ parsed: undefined, source: undefined, validation: undefined, validationError: undefined, currentTransaction: undefined, validating: false }),
}));
