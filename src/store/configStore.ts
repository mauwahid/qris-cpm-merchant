import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ApiEnvironment,
  AppSettings,
  EndpointConfig,
  MerchantConfig,
  MockConfig,
  SimulatorConfig,
  ValidationConfig,
} from '@/core/config/types';
import { CONFIG_VERSION, defaultConfig } from '@/core/config/defaults';
import { uuid } from '@/core/util/id';

export interface ConfigState extends SimulatorConfig {
  updateMerchant: (p: Partial<MerchantConfig>) => void;
  upsertEnvironment: (env: ApiEnvironment) => void;
  addEnvironment: (partial?: Partial<ApiEnvironment>) => string;
  duplicateEnvironment: (id: string) => string | undefined;
  deleteEnvironment: (id: string) => void;
  setActiveEnvironment: (id: string) => void;
  upsertEndpoint: (ep: EndpointConfig) => void;
  addEndpoint: () => string;
  deleteEndpoint: (id: string) => void;
  resetEndpoints: () => void;
  updateValidation: (p: Partial<ValidationConfig>) => void;
  updateMock: (p: Partial<MockConfig>) => void;
  updateApp: (p: Partial<AppSettings>) => void;
  resetAll: () => void;
  resetSection: (section: 'merchant' | 'environments' | 'endpoints' | 'validation' | 'mock' | 'app') => void;
  importConfig: (json: string) => { ok: boolean; error?: string };
  exportConfig: (includeSecrets: boolean) => string;
}

const SECRET_FIELDS: (keyof ApiEnvironment)[] = ['bearerToken', 'basicPassword', 'apiKey', 'customAuthHeaderValue'];

export function pickConfig(s: SimulatorConfig): SimulatorConfig {
  return {
    version: s.version,
    merchant: s.merchant,
    environments: s.environments,
    activeEnvironmentId: s.activeEnvironmentId,
    endpoints: s.endpoints,
    validation: s.validation,
    mock: s.mock,
    app: s.app,
  };
}

/** Deep-merges a (possibly partial / older) config over defaults so new fields always exist. */
export function normalizeConfig(input: Partial<SimulatorConfig>): SimulatorConfig {
  const d = defaultConfig();
  const envs = Array.isArray(input.environments) && input.environments.length
    ? input.environments.map((e) => ({ ...d.environments[0], ...e, id: e.id || uuid() }))
    : d.environments;
  const endpoints = Array.isArray(input.endpoints) && input.endpoints.length
    ? input.endpoints.map((e) => ({ ...d.endpoints[1], ...e, mapping: { ...d.endpoints[1].mapping, ...(e.mapping ?? {}) } }))
    : d.endpoints;
  const active = envs.some((e) => e.id === input.activeEnvironmentId) ? input.activeEnvironmentId! : envs[0].id;
  return {
    version: CONFIG_VERSION,
    merchant: { ...d.merchant, ...(input.merchant ?? {}) },
    environments: envs,
    activeEnvironmentId: active,
    endpoints,
    validation: { ...d.validation, ...(input.validation ?? {}) },
    mock: { ...d.mock, ...(input.mock ?? {}) },
    app: { ...d.app, ...(input.app ?? {}) },
  };
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      ...defaultConfig(),
      updateMerchant: (p) => set((s) => ({ merchant: { ...s.merchant, ...p } })),
      upsertEnvironment: (env) =>
        set((s) => ({
          environments: s.environments.some((e) => e.id === env.id) ? s.environments.map((e) => (e.id === env.id ? env : e)) : [...s.environments, env],
        })),
      addEnvironment: (partial) => {
        const id = `env-${uuid().slice(0, 8)}`;
        const base = defaultConfig().environments[0];
        set((s) => ({ environments: [...s.environments, { ...base, name: 'Custom', baseUrl: 'https://', ...partial, id }] }));
        return id;
      },
      duplicateEnvironment: (id) => {
        const src = get().environments.find((e) => e.id === id);
        if (!src) return undefined;
        const nid = `env-${uuid().slice(0, 8)}`;
        set((s) => ({ environments: [...s.environments, { ...structuredClone(src), id: nid, name: `${src.name} (copy)` }] }));
        return nid;
      },
      deleteEnvironment: (id) =>
        set((s) => {
          if (s.environments.length <= 1) return s;
          const environments = s.environments.filter((e) => e.id !== id);
          return { environments, activeEnvironmentId: s.activeEnvironmentId === id ? environments[0].id : s.activeEnvironmentId };
        }),
      setActiveEnvironment: (id) => set((s) => (s.environments.some((e) => e.id === id) ? { activeEnvironmentId: id } : s)),
      upsertEndpoint: (ep) =>
        set((s) => ({ endpoints: s.endpoints.some((e) => e.id === ep.id) ? s.endpoints.map((e) => (e.id === ep.id ? ep : e)) : [...s.endpoints, ep] })),
      addEndpoint: () => {
        const id = `ep-${uuid().slice(0, 8)}`;
        const tpl = defaultConfig().endpoints[1];
        set((s) => ({ endpoints: [...s.endpoints, { ...tpl, id, name: 'Custom Endpoint', role: 'CUSTOM', path: '/api/v1/custom', builtIn: false }] }));
        return id;
      },
      deleteEndpoint: (id) => set((s) => ({ endpoints: s.endpoints.filter((e) => e.id !== id) })),
      resetEndpoints: () => set({ endpoints: defaultConfig().endpoints }),
      updateValidation: (p) => set((s) => ({ validation: { ...s.validation, ...p } })),
      updateMock: (p) => set((s) => ({ mock: { ...s.mock, ...p } })),
      updateApp: (p) => set((s) => ({ app: { ...s.app, ...p } })),
      resetAll: () => set(defaultConfig()),
      resetSection: (section) => {
        const d = defaultConfig();
        if (section === 'environments') set({ environments: d.environments, activeEnvironmentId: d.activeEnvironmentId });
        else set({ [section]: d[section] } as Partial<ConfigState>);
      },
      importConfig: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'JSON root must be an object' };
          const cfg = normalizeConfig(parsed.config ?? parsed);
          set(cfg);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      },
      exportConfig: (includeSecrets) => {
        const cfg = structuredClone(pickConfig(get()));
        if (!includeSecrets) {
          cfg.environments = cfg.environments.map((e) => {
            const copy = { ...e };
            for (const f of SECRET_FIELDS) (copy[f] as string) = '';
            return copy;
          });
        }
        return JSON.stringify({ exportedAt: new Date().toISOString(), application: 'merchant-cpm-aspi-simulator', config: cfg }, null, 2);
      },
    }),
    {
      name: 'cpm-sim:config',
      version: CONFIG_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => pickConfig(s),
      merge: (persisted, current) => ({ ...current, ...normalizeConfig((persisted ?? {}) as Partial<SimulatorConfig>) }),
    },
  ),
);

export const selectActiveEnvironment = (s: SimulatorConfig) => s.environments.find((e) => e.id === s.activeEnvironmentId) ?? s.environments[0];
export const effectiveExecutionMode = (s: SimulatorConfig) => (s.app.apiIntegrationEnabled ? s.app.executionMode : 'MOCK');
export const effectiveValidationMode = (s: SimulatorConfig) => (s.app.apiIntegrationEnabled ? 'BACKEND' : 'LOCAL');
