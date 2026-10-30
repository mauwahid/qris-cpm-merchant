import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/App';
import { useConfigStore } from '@/store/configStore';
import { useSessionStore } from '@/store/sessionStore';
import { useTransactionStore } from '@/store/transactionStore';
import { defaultConfig } from '@/core/config/defaults';
import { generateSamplePayload } from '@/core/cpm/sampleGenerator';
import { ingestPayload } from '@/services/simulator';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('App integration (standalone mode)', () => {
  beforeEach(() => {
    useConfigStore.setState({ ...defaultConfig(), mock: { ...defaultConfig().mock, processingDelayMs: 10 } });
    useSessionStore.getState().clearCurrent();
    useSessionStore.setState({ lastTransaction: undefined, amount: 0 });
    useTransactionStore.getState().clear();
  });

  it('renders the dashboard with merchant information and standalone badges', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Merchant Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByText('DEMO MERCHANT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('123456789012345').length).toBeGreaterThan(0);
    expect(screen.getByText('STANDALONE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Scanner/ })).toBeInTheDocument();
  });

  it('parses, validates locally and approves a payment without any HTTP request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderAt('/scanner');
    ingestPayload(generateSamplePayload(), 'SAMPLE');
    await waitFor(() => expect(screen.getByText('VALID')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Accept Payment/ }));
    await waitFor(() => expect(useTransactionStore.getState().transactions[0]?.status).toBe('APPROVED'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects a payment from the reject dialog', async () => {
    renderAt('/scanner');
    ingestPayload(generateSamplePayload(), 'SAMPLE');
    await waitFor(() => expect(screen.getByText('VALID')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Reject Payment/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Reject/ }));
    expect(useTransactionStore.getState().transactions[0].status).toBe('REJECTED');
  });

  it('shows INVALID for an MPM payload and disables Accept', async () => {
    renderAt('/scanner');
    ingestPayload('00020101021126', 'SAMPLE');
    await waitFor(() => expect(screen.getByText('INVALID')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Accept Payment/ })).toBeDisabled();
  });

  it('toggles API integration from the header', () => {
    renderAt('/');
    const sw = screen.getByRole('switch', { name: 'API Integration' });
    fireEvent.click(sw);
    expect(useConfigStore.getState().app.apiIntegrationEnabled).toBe(true);
    expect(screen.getByText('Validation: BACKEND')).toBeInTheDocument();
  });
});
