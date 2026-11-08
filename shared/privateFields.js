/**
 * Private scholarship-eligibility details (all optional). Used only by the
 * deterministic eligibility checks; never sent to the AI and never shown to
 * colleges. Shared by the API (validation) and the profile form (options).
 */
export const GENDERS = Object.freeze([
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Another gender / non-binary' },
]);

export const SOCIAL_CATEGORIES = Object.freeze([
  { value: 'general', label: 'General' },
  { value: 'obc', label: 'OBC (non-creamy layer)' },
  { value: 'sc', label: 'SC' },
  { value: 'st', label: 'ST' },
  { value: 'ews', label: 'EWS' },
]);

export const PARENT_SERVICES = Object.freeze([
  { value: 'none', label: 'None of these' },
  { value: 'capf', label: 'CAPF or Assam Rifles' },
  { value: 'railways', label: 'Railways (incl. RPF / RPSF)' },
  { value: 'defence', label: 'Defence (Army, Navy, Air Force) or ex-servicemen' },
  { value: 'state_police', label: 'State / UT police' },
]);

export const PRIVATE_PROFILE_FIELDS = Object.freeze(['annualFamilyIncomeINR', 'homeState', 'gender', 'socialCategory', 'disability', 'minority', 'parentService', 'firstGeneration']);
