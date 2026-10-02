import { useDomainMutation } from '@/lib/useDomainMutation';
import { apiPost, api, apiPatch } from '@/lib/api';
import type { ApiPayslip, SavePayslipInput } from '../types';
import { normalizePayslip } from '../utils/normalizers';
import type { PayslipDocument } from '@quro/shared';
import { normalizePdfDocument, type ApiPdfDocument } from '@/lib/pdfDocuments';
export function useCreatePayslip() {
  return useDomainMutation('salary', async (payslip: SavePayslipInput) => {
    const payload = await apiPost<ApiPayslip>('/api/salary/payslips', payslip);
    return normalizePayslip(payload);
  });
}

export function useDeletePayslip() {
  return useDomainMutation('salary', async (id: number) => {
    await api.delete(`/api/salary/payslips/${id}`);
  });
}

export function useDeletePayslipDocument() {
  return useDomainMutation('salaryDocument', async (payslipId: number) => {
    await api.delete(`/api/salary/payslips/${payslipId}/document`);
  });
}

type UpdatePayslipInput = {
  id: number;
  payslip: SavePayslipInput;
};

export function useUpdatePayslip() {
  return useDomainMutation('salary', async ({ id, payslip }: UpdatePayslipInput) => {
    const payload = await apiPatch<ApiPayslip>(`/api/salary/payslips/${id}`, payslip);
    return normalizePayslip(payload);
  });
}

type UploadPayslipDocumentInput = {
  payslipId: number;
  file: File;
};

function normalizeRequiredPayslipDocument(document: ApiPdfDocument): PayslipDocument {
  return (
    normalizePdfDocument(document) ?? {
      fileName: 'payslip.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 0,
      uploadedAt: new Date().toISOString(),
    }
  );
}

export function useUploadPayslipDocument() {
  return useDomainMutation(
    'salaryDocument',
    async ({ payslipId, file }: UploadPayslipDocumentInput) => {
      const formData = new FormData();
      formData.append('file', file);

      const payload = await apiPost<ApiPdfDocument>(
        `/api/salary/payslips/${payslipId}/document`,
        formData,
      );
      return normalizeRequiredPayslipDocument(payload);
    },
  );
}
