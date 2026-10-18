import { useQuery } from '@tanstack/react-query';
import type {
  ExposureReport,
  ExposureSettings,
  ExposureSettingsState,
  HoldingClassificationUpdate,
} from '@quro/shared';
import { apiDelete, apiGet, apiPatch, apiPut } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useDomainMutation } from '@/lib/useDomainMutation';

export function useExposure() {
  return useQuery({
    queryKey: queryKeys.exposure.report,
    queryFn: () => apiGet<ExposureReport>('/api/exposure'),
  });
}

export function useSaveExposureSettings() {
  return useDomainMutation('exposureSettings', (settings: ExposureSettings) =>
    apiPut<ExposureSettingsState>('/api/exposure/settings', settings),
  );
}

export function useResetExposureSettings() {
  return useDomainMutation('exposureSettings', () =>
    apiDelete<ExposureSettingsState>('/api/exposure/settings'),
  );
}

export function useClassifyHoldings() {
  return useDomainMutation('holdingClassification', (updates: HoldingClassificationUpdate[]) =>
    apiPatch<HoldingClassificationUpdate[]>('/api/exposure/classification', { updates }),
  );
}
