/** Document types (same keys as the server's documents/kinds.js). Aadhaar and bank details are never uploaded. */
export const DOC_KINDS: { key: string; label: string; storable: boolean }[] = [
  { key: 'income_certificate', label: 'Income certificate', storable: true },
  { key: 'caste_certificate', label: 'Caste / category certificate', storable: true },
  { key: 'domicile_certificate', label: 'Domicile / residence certificate', storable: true },
  { key: 'disability_certificate', label: 'Disability certificate (UDID)', storable: true },
  { key: 'marksheets', label: 'Mark sheets', storable: true },
  { key: 'bonafide_certificate', label: 'Bonafide / student certificate', storable: true },
  { key: 'admission_proof', label: 'Admission letter / fee receipt', storable: true },
  { key: 'photograph', label: 'Passport-size photo', storable: true },
  { key: 'recommendation', label: 'Recommendation / referee details', storable: true },
  { key: 'resume', label: 'CV / résumé', storable: true },
  { key: 'aadhaar', label: 'Aadhaar', storable: false },
  { key: 'bank_details', label: 'Bank account details', storable: false },
];
export const kindLabel = (k: string) => DOC_KINDS.find((d) => d.key === k)?.label ?? 'Other document';
export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
