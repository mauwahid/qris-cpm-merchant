import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Transaction, TransactionRepository } from '@/core/types';
import { useConfigStore } from './configStore';

interface TransactionState {
  transactions: Transaction[];
  save: (tx: Transaction) => void;
  clear: () => void;
}

export const useTransactionStore = create<TransactionState>()(
  persist(
    (set) => ({
      transactions: [],
      save: (tx) =>
        set((s) => {
          const idx = s.transactions.findIndex((t) => t.transactionId === tx.transactionId);
          if (idx >= 0) {
            const copy = [...s.transactions];
            copy[idx] = tx;
            return { transactions: copy };
          }
          const max = useConfigStore.getState().app.maxHistoryEntries || 1000;
          return { transactions: [tx, ...s.transactions].slice(0, max) };
        }),
      clear: () => set({ transactions: [] }),
    }),
    {
      name: 'cpm-sim:transactions',
      storage: createJSONStorage(() => localStorage),
      // A transaction persisted mid-flight cannot resume after reload; mark it as timed out.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TransactionState>;
        const txs = (p.transactions ?? []).map((t) =>
          t.status === 'PROCESSING' ? { ...t, status: 'TIMEOUT' as const, responseCode: '68', responseMessage: 'Interrupted (page reloaded during processing)' } : t,
        );
        return { ...current, transactions: txs };
      },
    },
  ),
);

/** Transaction History Repository backed by the persisted (localStorage) store. */
export const storeTransactionRepository: TransactionRepository = {
  list: () => useTransactionStore.getState().transactions,
  get: (id) => useTransactionStore.getState().transactions.find((t) => t.transactionId === id),
  save: (tx) => useTransactionStore.getState().save(tx),
  clear: () => useTransactionStore.getState().clear(),
  findByPayloadHash: (hash) => useTransactionStore.getState().transactions.filter((t) => t.payloadHash === hash),
  findByReference: (ref) => useTransactionStore.getState().transactions.filter((t) => t.transactionReference === ref),
};
