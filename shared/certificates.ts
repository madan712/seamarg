// Single source of truth for the certificate catalog shared by the web frontend
// (frontend/) and the mobile app (mobile/). Pure data + types, zero runtime
// dependencies, so both a Vite and a Metro bundle can inline it.
//
// IMPORTANT: `slug` on a category is the value the backend understands
// (CertificateCategory.fromSlug in the backend). It is what goes into the
// /api/customer/certificates/{category}/{type}/... URL — never the enum name.
// Keep these in sync with backend CertificateCategory and the entry form fields.

export type CategorySlug =
  | 'general'
  | 'ncoc'
  | 'medical'
  | 'tanker-passenger'
  | 'offshore'
  | 'flag-state';

export type CertificateType = { slug: string; label: string };

// A certificate category. `icon` is a neutral semantic token; each client maps
// it to its own icon set (mobile → Ionicons, web → emoji/other).
export type CertificateCategory = {
  slug: CategorySlug;
  label: string;
  icon: 'shield' | 'certificate' | 'medical' | 'tanker' | 'offshore' | 'flag';
};

// Category-specific fields beyond the common set (PRD §5.3).
export type CertificateExtraField = {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  required?: boolean;
};

// A field in the common certificate entry form.
export type CertificateFieldDef = {
  key: string;
  label: string;
  type: 'text' | 'date';
  required?: boolean;
};

// Ordered list of categories. Labels mirror the web certificate sub-nav.
export const CERTIFICATE_CATEGORIES: CertificateCategory[] = [
  { slug: 'general', label: 'General certificates', icon: 'shield' },
  { slug: 'ncoc', label: 'National Certificates Of Competency', icon: 'certificate' },
  { slug: 'medical', label: 'Medical Certificates', icon: 'medical' },
  { slug: 'tanker-passenger', label: 'Tanker/Passenger certificates', icon: 'tanker' },
  { slug: 'offshore', label: 'Offshore certificates', icon: 'offshore' },
  { slug: 'flag-state', label: 'Flag State Documents', icon: 'flag' },
];

const GENERAL_CERTIFICATES: CertificateType[] = [
  { slug: 'stcw-basic-safety-training', label: 'STCW Basic Safety Training' },
  { slug: 'proficiency-survival-craft', label: 'Proficiency in Survival Craft & Rescue Boats' },
  { slug: 'advanced-fire-fighting', label: 'Advanced Fire Fighting' },
  { slug: 'medical-first-aid', label: 'Medical First Aid' },
  { slug: 'gmdss-general-operator', label: 'GMDSS General Operator' },
  { slug: 'ship-security-awareness', label: 'Ship Security Awareness' },
];

const NCOC_CERTIFICATES: CertificateType[] = [
  { slug: 'coc-deck', label: 'Certificate of Competency — Deck' },
  { slug: 'coc-engine', label: 'Certificate of Competency — Engine' },
  { slug: 'gmdss-radio-operator', label: 'GMDSS Radio Operator' },
];

const MEDICAL_CERTIFICATES: CertificateType[] = [
  { slug: 'medical-fitness', label: 'Medical Fitness (ILO/MLC)' },
  { slug: 'drug-alcohol-test', label: 'Drug & Alcohol Test' },
  { slug: 'yellow-fever-vaccination', label: 'Yellow Fever Vaccination' },
];

const TANKER_CERTIFICATES: CertificateType[] = [
  { slug: 'basic-oil-chemical-tanker', label: 'Basic Training Oil & Chemical Tanker' },
  { slug: 'advanced-oil-tanker', label: 'Advanced Oil Tanker Operations' },
  { slug: 'liquefied-gas-tanker', label: 'Liquefied Gas Tanker' },
  { slug: 'passenger-ship-crowd-management', label: 'Passenger Ship Crowd Management' },
];

const OFFSHORE_CERTIFICATES: CertificateType[] = [
  { slug: 'bosiet', label: 'BOSIET' },
  { slug: 'huet', label: 'HUET' },
  { slug: 'foet', label: 'FOET' },
  { slug: 't-bosiet', label: 'T-BOSIET' },
];

const FLAG_STATE_CERTIFICATES: CertificateType[] = [
  { slug: 'panama-endorsement', label: 'Panama Flag Endorsement' },
  { slug: 'liberia-endorsement', label: 'Liberia Flag Endorsement' },
  { slug: 'marshall-islands-endorsement', label: 'Marshall Islands Flag Endorsement' },
];

export const CERTIFICATE_CATALOGS: Record<CategorySlug, CertificateType[]> = {
  general: GENERAL_CERTIFICATES,
  ncoc: NCOC_CERTIFICATES,
  medical: MEDICAL_CERTIFICATES,
  'tanker-passenger': TANKER_CERTIFICATES,
  offshore: OFFSHORE_CERTIFICATES,
  'flag-state': FLAG_STATE_CERTIFICATES,
};

// Dummy COC grades (NCOC only) — real reference data loads later.
export const COC_GRADE_OPTIONS: string[] = [
  'Master',
  'Chief Mate',
  'Officer in Charge of a Navigational Watch',
  'Chief Engineer',
  'Second Engineer',
  'Engineer Officer in Charge of a Watch',
];

export const CERTIFICATE_EXTRA_FIELDS: Record<string, CertificateExtraField[]> = {
  ncoc: [{ key: 'cocGrade', label: 'COC grade', type: 'select', options: COC_GRADE_OPTIONS, required: true }],
  medical: [{ key: 'clinicName', label: 'Clinic Name', type: 'text' }],
};

// Common fields on every certificate entry (mirrors the web entry form).
export const COMMON_CERTIFICATE_FIELDS: CertificateFieldDef[] = [
  { key: 'number', label: 'Number', type: 'text' },
  { key: 'issuedDate', label: 'Issued Date', type: 'date', required: true },
  { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
  { key: 'issuePlace', label: 'Issue Place', type: 'text', required: true },
  { key: 'issuingAuthority', label: 'Issuing Authority', type: 'text', required: true },
];

export function certificateCatalog(categorySlug: string): CertificateType[] {
  return CERTIFICATE_CATALOGS[categorySlug as CategorySlug] ?? [];
}

export function certificateCategory(categorySlug: string): CertificateCategory | undefined {
  return CERTIFICATE_CATEGORIES.find((category) => category.slug === categorySlug);
}

export function certificateType(categorySlug: string, typeSlug: string): CertificateType | undefined {
  return certificateCatalog(categorySlug).find((type) => type.slug === typeSlug);
}
