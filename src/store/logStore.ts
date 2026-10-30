import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ApiLogEntry, AppLogEntry, LogCategory, LogLevel } from '@/core/types';
import { uuid } from '@/core/util/id';
import { useConfigStore } from './configStore';

interface LogState {
  apiLogs: ApiLogEntry[];
  appLogs: AppLogEntry[];
  addApiLog: (e: ApiLogEntry) => void;
  addAppLog: (category: LogCategory, level: LogLevel, message: string, data?: unknown, correlationId?: string) => void;
  clearApiLogs: () => void;
  clearAppLogs: (category?: LogCategory) => void;
}

const MAX_APP_LOGS = 1000;

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
      apiLogs: [],
      appLogs: [],
      addApiLog: (e) =>
        set((s) => ({ apiLogs: [e, ...s.apiLogs].slice(0, useConfigStore.getState().app.maxApiLogEntries || 500) })),
      addAppLog: (category, level, message, data, correlationId) =>
        set((s) => ({
          appLogs: [{ id: uuid(), timestamp: new Date().toISOString(), category, level, message, data, correlationId }, ...s.appLogs].slice(0, MAX_APP_LOGS),
        })),
      clearApiLogs: () => set({ apiLogs: [] }),
      clearAppLogs: (category) => set((s) => ({ appLogs: category ? s.appLogs.filter((l) => l.category !== category) : [] })),
    }),
    { name: 'cpm-sim:logs', storage: createJSONStorage(() => localStorage) },
  ),
);

/** Logging service facade usable outside React. */
export const AppLog = {
  parsing: (level: LogLevel, msg: string, data?: unknown, cid?: string) => useLogStore.getState().addAppLog('PARSING', level, msg, data, cid),
  validation: (level: LogLevel, msg: string, data?: unknown, cid?: string) => useLogStore.getState().addAppLog('VALIDATION', level, msg, data, cid),
  transaction: (level: LogLevel, msg: string, data?: unknown, cid?: string) => useLogStore.getState().addAppLog('TRANSACTION', level, msg, data, cid),
  scanner: (level: LogLevel, msg: string, data?: unknown, cid?: string) => useLogStore.getState().addAppLog('SCANNER', level, msg, data, cid),
  system: (level: LogLevel, msg: string, data?: unknown, cid?: string) => useLogStore.getState().addAppLog('SYSTEM', level, msg, data, cid),
};

export const apiLogSink = { add: (e: ApiLogEntry) => useLogStore.getState().addApiLog(e) };
