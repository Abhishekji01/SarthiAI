/**
 * The one list of Indian states and union territories, used by the profile
 * forms (web/Android) and validated by the API. Names follow the official
 * spellings used on scholarship portals.
 */
export const STATES = Object.freeze([
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]);

export const UNION_TERRITORIES = Object.freeze([
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

/** Shown last in the picker for students outside India. */
export const OTHER_STATE = 'Other';

export const HOME_STATE_OPTIONS = Object.freeze([...STATES, ...UNION_TERRITORIES, OTHER_STATE]);
export const isHomeStateOption = (s) => HOME_STATE_OPTIONS.includes(s);
