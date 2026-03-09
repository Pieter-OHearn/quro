import type { PayslipDocument } from '@quro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { normalizePdfDocument, type ApiPdfDocument } from '@/lib/pdfDocuments';
import { salaryQueryKeys } from './queryKeys';

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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ payslipId, file }: UploadPayslipDocumentInput) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post(`/api/salary/payslips/${payslipId}/document`, formData);
      return normalizeRequiredPayslipDocument(data.data as ApiPdfDocument);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: salaryQueryKeys.all });
    },
  });
}
