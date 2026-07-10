import './styles.css';
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type ISignUpResult,
} from 'amazon-cognito-identity-js';

type UserClaims = Record<string, unknown> & {
  email?: string;
  name?: string;
  sub?: string;
};

type AuthSession = {
  accessToken: string;
  expiresAt: number;
  claims: UserClaims;
  idToken?: string;
  refreshToken?: string;
};

type AppConfig = {
  cognitoUserPoolId: string;
  cognitoClientId: string;
  apiBaseUrl: string;
};

type AuthMode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

type NoticeKind = 'info' | 'success' | 'warning' | 'error';

type Route = {
  path: string;
  label: string;
  render: (session: AuthSession | null) => string;
  nav?: 'public' | 'private';
  requiresAuth?: boolean;
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

const appRoot = app;

const storageKeys = {
  session: 'seamarg.auth.session',
  bannerDismissed: 'seamarg.portal.bannerDismissed',
  admin: 'seamarg.admin.password',
};

const runtimeConfig = (
  window as Window & {
    __SEAMARG_CONFIG__?: Partial<AppConfig>;
  }
).__SEAMARG_CONFIG__;

const config: AppConfig = {
  cognitoUserPoolId: firstConfigValue(
    import.meta.env.VITE_COGNITO_USER_POOL_ID,
    runtimeConfig?.cognitoUserPoolId,
  ),
  cognitoClientId: firstConfigValue(import.meta.env.VITE_COGNITO_CLIENT_ID, runtimeConfig?.cognitoClientId),
  apiBaseUrl: resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, runtimeConfig?.apiBaseUrl),
};

let authMode: AuthMode = 'signin';
let authNotice = '';
let authNoticeKind: NoticeKind = 'info';
let welcomeBannerDismissed = window.sessionStorage.getItem(storageKeys.bannerDismissed) === '1';
let accountMenuOpen = false;
// Recreated each time the landing page renders; disconnected first to avoid leaks.
let landingRevealObserver: IntersectionObserver | null = null;
let pendingEmail = '';
let pendingPasswordForAutoSignIn = '';

// Portal per-page notice (e.g. "Saved."), scoped to the page that set it.
let portalNotice: { path: string; message: string; kind: NoticeKind } | null = null;

// The public home page ('/') is a single scrolling landing page rendered
// outside the shared layout (it carries its own fixed header + footer to match
// the design). Everything else here is a conventional in-shell route.
const publicRoutes: Route[] = [{ path: '/signin', label: 'Sign in', render: renderSignIn }];

// Private seafarer portal information architecture.
// Top-level steps map to the redesigned 3-step profile builder; each step owns a
// left submenu of sub-pages. See docs/private-portal-prd.md.
type PrivateSubPage = {
  slug: string;
  label: string;
  icon: string;
};

type PrivateStep = {
  path: string;
  label: string;
  icon: string;
  subPages: PrivateSubPage[];
};

const privateSteps: PrivateStep[] = [
  {
    path: '/profile',
    label: 'Your profile',
    icon: '🪪',
    subPages: [
      { slug: 'guide', label: 'Guide to filling your profile', icon: '❓' },
      { slug: 'main-information', label: 'Main information', icon: '👤' },
      { slug: 'contact-details', label: 'Contact details', icon: '📞' },
      { slug: 'passport', label: 'Passport and Seaman book', icon: '📗' },
      { slug: 'address', label: 'Address and Airport', icon: '📍' },
      { slug: 'languages', label: 'Languages', icon: '🈳' },
      { slug: 'professional-skills', label: 'Professional skills', icon: '🛠️' },
      { slug: 'visas', label: 'Visas', icon: '🛂' },
      { slug: 'relatives', label: 'Relatives and next of kin', icon: '👪' },
      { slug: 'notes', label: 'Notes and miscellaneous', icon: '📝' },
    ],
  },
  {
    path: '/certificates',
    label: 'Certificates',
    icon: '📜',
    subPages: [
      { slug: 'guide', label: 'Guide to entering certificates', icon: '❓' },
      { slug: 'main-documents', label: 'Main documents', icon: '🗂️' },
      { slug: 'general', label: 'General certificates', icon: '📄' },
      { slug: 'ncoc', label: 'National Certificates Of Competency', icon: '📄' },
      { slug: 'medical', label: 'Medical Certificates', icon: '🩺' },
      { slug: 'tanker-passenger', label: 'Tanker/Passenger certificates', icon: '📄' },
      { slug: 'offshore', label: 'Offshore certificates', icon: '📄' },
      { slug: 'flag-state', label: 'Flag State Documents', icon: '🚩' },
      { slug: 'sharing', label: 'Share documents', icon: '🔗' },
    ],
  },
  {
    path: '/courses',
    label: 'Courses',
    icon: '🎓',
    // Placeholder step — the course-booking workspace is built in a later phase.
    // Any sub-page that has no explicit renderer falls back to the "coming soon"
    // placeholder in renderPrivateSubPageBody.
    subPages: [{ slug: 'guide', label: 'Course booking', icon: '🎓' }],
  },
  {
    path: '/sea-service',
    label: 'Sea service records',
    icon: '🚢',
    subPages: [
      { slug: 'guide', label: 'Guide to filling out sea service', icon: '❓' },
    ],
  },
];

// Post-login landing: Step 1, first sub-page (Guide to filling your profile).
const DEFAULT_PRIVATE_PATH = '/profile';

function findPrivateStep(stepPath: string): PrivateStep | undefined {
  return privateSteps.find((step) => step.path === stepPath);
}

function firstPathSegment(path: string): string {
  return path.split('/').filter(Boolean)[0] ?? '';
}

function isPrivatePath(path: string): boolean {
  const segment = `/${firstPathSegment(path)}`;
  return segment === '/account' || Boolean(findPrivateStep(segment));
}

function resolvePrivateView(path: string): { step: PrivateStep; sub: PrivateSubPage } | null {
  const segments = path.split('/').filter(Boolean);
  const step = findPrivateStep(`/${segments[0] ?? ''}`);

  if (!step) {
    return null;
  }

  const requestedSlug = segments[1];
  const sub = step.subPages.find((page) => page.slug === requestedSlug) ?? step.subPages[0];

  if (!sub) {
    return null;
  }

  return { step, sub };
}

// ---------------------------------------------------------------------------
// Seafarer profile data (client-side draft persistence).
//
// The backend profile API does not exist yet. Until it does, each profile
// section is saved to localStorage keyed by Cognito subject so the form is
// genuinely fillable/editable and survives reloads. Swapping this for a real
// API later only requires changing loadProfile/saveProfileSection.
// ---------------------------------------------------------------------------
type MainInformation = {
  firstName: string;
  middleName: string;
  lastName: string;
  sex: string;
  position: string;
  altPosition1: string;
  altPosition2: string;
  altPosition3: string;
  altPosition4: string;
  offshore: boolean;
  dateOfReadiness: string;
  minSalaryUsd: string;
  citizenship: string;
  placeOfBirth: string;
  dateOfBirth: string;
  highestEducation: string;
  yearGraduated: string;
  graduatedFrom: string;
  educationalLevel: string;
};

type ContactDetails = {
  email: string;
  mobilePhone1: string;
  mobilePhone2: string;
  mobilePhone3: string;
  mobilePhone4: string;
  homeTelephone: string;
};

type PassportDetails = {
  passportNumber: string;
  passportIssueDate: string;
  passportExpiryDate: string;
  seamanBookNumber: string;
  seamanBookIssueDate: string;
  seamanBookExpiryDate: string;
  individualTaxNumber: string;
};

type AddressDetails = {
  country: string;
  province: string;
  city: string;
  postCode: string;
  street: string;
  houseNumber: string;
  apartmentNumber: string;
  mainAirportName: string;
  mainAirportTravelTime: string;
  altAirportName: string;
  altAirportTravelTime: string;
};

// Language proficiency keyed by language slug (e.g. { english: "Fluent" }).
type LanguageLevels = Record<string, string>;

// Professional skills keyed by skill slug (e.g. { rov: true }).
type ProfessionalSkills = Record<string, boolean>;

// Visas keyed by visa slug, each with a "held" flag and expiry date, plus a free-text field.
type VisaDetails = {
  entries: Record<string, { held: boolean; expiry: string }>;
  otherVisas: string;
};

type MiscDetails = {
  coverallSize: string;
  bodyWeight: string;
  bodyHeight: string;
  shoeSize: string;
  religion: string;
  hairColor: string;
  eyeColor: string;
  bloodType: string;
  notes: string;
};

type RelativesDetails = {
  maritalStatus: string;
  dateOfMarriage: string;
  numberOfChildren: string;
  numberOfSons: string;
  numberOfDaughters: string;
  fatherFullName: string;
  motherFullName: string;
  nokFirstName: string;
  nokMiddleName: string;
  nokSurname: string;
  nokAddress: string;
  nokRelationDegree: string;
  nokContactPhone: string;
  emergencyContactName: string;
};

// Profile sections loaded from the backend, keyed by section slug (e.g. "main").
type ProfileSections = Record<string, Record<string, unknown>>;

type ProfileState = {
  loadedForSubject: string | null;
  loading: boolean;
  sections: ProfileSections;
  error: string;
};

let profileState: ProfileState = {
  loadedForSubject: null,
  loading: false,
  sections: {},
  error: '',
};

function resetProfileState(): void {
  profileState = { loadedForSubject: null, loading: false, sections: {}, error: '' };
}

// Certificates area state (Step 2). Loaded once per Cognito subject, loop-safe
// like profileState. For now it holds the Main documents held/not-held map;
// detailed certificate entries are added in a later step.
// Detailed certificate entries: category slug → catalog type slug → field values.
type CertificateEntries = Record<string, Record<string, Record<string, unknown>>>;

type CertificatesState = {
  loadedForSubject: string | null;
  loading: boolean;
  mainDocuments: Record<string, boolean>;
  entries: CertificateEntries;
  error: string;
};

let certificatesState: CertificatesState = {
  loadedForSubject: null,
  loading: false,
  mainDocuments: {},
  entries: {},
  error: '',
};

// Which accordion entries are expanded, keyed by `${category}:${typeSlug}`.
const expandedCertificates = new Set<string>();

// Uploaded-but-unsaved file metadata + AI suggestions per entry, keyed the same way.
type CertificateFileMeta = {
  bucketName?: string;
  objectKey?: string;
  originalFilename?: string;
  contentType?: string;
  sizeBytes?: number;
};
type CertificateDraft = {
  file?: CertificateFileMeta;
  extraction?: Record<string, string | null>;
  note?: string;
};
const certificateDrafts = new Map<string, CertificateDraft>();

function resetCertificatesState(): void {
  certificatesState = {
    loadedForSubject: null,
    loading: false,
    mainDocuments: {},
    entries: {},
    error: '',
  };
  expandedCertificates.clear();
  certificateDrafts.clear();
}

// Dummy option lists — replaced with real reference data later (PRD §9).
const SEX_OPTIONS = ['Male', 'Female'];

const POSITION_OPTIONS = [
  'Master',
  'Chief Officer',
  'Second Officer',
  'Third Officer',
  'Deck Cadet',
  'Chief Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Electro-Technical Officer (ETO)',
  'Engine Cadet',
  'Bosun',
  'Able Seaman (AB)',
  'Ordinary Seaman (OS)',
  'Oiler',
  'Motorman',
  'Fitter',
  'Chief Cook',
  'Steward',
];

const CITIZENSHIP_OPTIONS = [
  'India',
  'Philippines',
  'Ukraine',
  'Russia',
  'Indonesia',
  'China',
  'Bangladesh',
  'Myanmar',
  'United Kingdom',
  'Norway',
  'Netherlands',
  'Greece',
  'Turkey',
  'Brazil',
  'United States',
  'Other',
];

const EDUCATION_OPTIONS = [
  'High school',
  'Diploma',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate',
  'Other',
];

// Fixed reference list of languages (final list TBD) with a proficiency dropdown each.
const LANGUAGES: { slug: string; label: string }[] = [
  { slug: 'english', label: 'English' },
  { slug: 'german', label: 'German' },
  { slug: 'spanish', label: 'Spanish' },
  { slug: 'dutch', label: 'Dutch' },
];

const LANGUAGE_LEVEL_OPTIONS = ['Basic', 'Conversational', 'Fluent', 'Native'];

// Yes/no professional-skill checkboxes.
const PROFESSIONAL_SKILLS: { slug: string; label: string }[] = [
  { slug: 'ah', label: 'AH experience' },
  { slug: 'rov', label: 'ROV experience' },
  { slug: 'rigMove', label: 'RIG-move experience' },
  { slug: 'azimuthAsd', label: 'Azimuth ASD experience' },
  { slug: 'towing', label: 'Towing experience' },
  { slug: 'boatHandling', label: 'Boat handling experience' },
];

const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'];

// Notes & miscellaneous dropdowns (dummy option lists).
const RELIGION_OPTIONS = [
  'Christianity',
  'Islam',
  'Hinduism',
  'Buddhism',
  'Judaism',
  'Sikhism',
  'Other',
  'Prefer not to say',
];
const HAIR_COLOR_OPTIONS = ['Black', 'Brown', 'Blonde', 'Red', 'Grey', 'White', 'Other'];
const EYE_COLOR_OPTIONS = ['Brown', 'Blue', 'Green', 'Hazel', 'Grey', 'Black', 'Other'];
const BLOOD_TYPE_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Step 2 — "Main documents" checkbox grid (dummy catalog; real list loads later).
const MAIN_DOCUMENTS: { slug: string; label: string }[] = [
  { slug: 'covidVaccinated', label: 'COVID-19 fully vaccinated' },
  { slug: 'aramco', label: 'ARAMCO approval' },
  { slug: 'bosietNogepa', label: 'BOSIET (NOGEPA)' },
  { slug: 'bosietOpito', label: 'BOSIET (OPITO)' },
  { slug: 'dpAdvanced', label: 'DP Advanced Course' },
  { slug: 'dpInduction', label: 'DP Induction Course' },
  { slug: 'dpLimited', label: 'DP Limited Course' },
  { slug: 'dpMaintenance', label: 'DP Maintenance Course' },
  { slug: 'dpUnlimited', label: 'DP Unlimited Course' },
  { slug: 'foet', label: 'FOET' },
  { slug: 'highVoltage', label: 'High voltage' },
  { slug: 'huetNogepa', label: 'HUET (NOGEPA)' },
  { slug: 'huetOpito', label: 'HUET (OPITO)' },
  { slug: 'sparrow1', label: 'Sparrow Stage 1 Certificate' },
  { slug: 'sparrow2', label: 'Sparrow Stage 2 Certificate' },
  { slug: 'sparrow3', label: 'Sparrow Stage 3 Certificate' },
  { slug: 'tbosiet', label: 'TBOSIET' },
];

// Step 2 — detailed certificate catalogs (dummy; real reference data loads later).
type CertificateType = { slug: string; label: string };

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

const CERTIFICATE_CATALOGS: Record<string, CertificateType[]> = {
  general: GENERAL_CERTIFICATES,
  ncoc: NCOC_CERTIFICATES,
  medical: MEDICAL_CERTIFICATES,
  'tanker-passenger': TANKER_CERTIFICATES,
  offshore: OFFSHORE_CERTIFICATES,
  'flag-state': FLAG_STATE_CERTIFICATES,
};

// Dummy COC grades (NCOC only) — real reference data loads later.
const COC_GRADE_OPTIONS = [
  'Master',
  'Chief Mate',
  'Officer in Charge of a Navigational Watch',
  'Chief Engineer',
  'Second Engineer',
  'Engineer Officer in Charge of a Watch',
];

// Category-specific fields beyond the common set (PRD §5.3).
type CertificateExtraField = {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: string[];
  required?: boolean;
};
const CERTIFICATE_EXTRA_FIELDS: Record<string, CertificateExtraField[]> = {
  ncoc: [{ key: 'cocGrade', label: 'COC grade', type: 'select', options: COC_GRADE_OPTIONS, required: true }],
  medical: [{ key: 'clinicName', label: 'Clinic Name', type: 'text' }],
};

function certificateCatalog(categorySlug: string): CertificateType[] {
  return CERTIFICATE_CATALOGS[categorySlug] ?? [];
}

// Visas — each has a "held" checkbox plus an expiry date.
const VISAS: { slug: string; label: string }[] = [
  { slug: 'brazil', label: 'Brazil visa' },
  { slug: 'schengen', label: 'Schengen visa' },
  { slug: 'usa', label: 'USA visa' },
  { slug: 'canadian', label: 'Canadian visa' },
  { slug: 'ksa', label: 'KSA visa' },
  { slug: 'uae', label: 'UAE visa' },
  { slug: 'uk', label: 'UK visa' },
];

// Load all profile sections for the signed-in user from the backend once per
// session (per Cognito subject). Errors are surfaced but do not block editing.
//
// IMPORTANT: this is triggered from bindCurrentPage on every render, and it
// calls renderApp() itself, so the guard must hold *synchronously* to avoid an
// infinite loop. We mark loadedForSubject BEFORE the first renderApp and treat
// an errored attempt as "attempted" too (retry is explicit via force), so a
// failing request cannot retrigger itself endlessly.
async function loadProfileFromApi(session: AuthSession, force = false): Promise<void> {
  const subject = claimToString(session.claims.sub) ?? 'anonymous';

  if (!force && profileState.loadedForSubject === subject) {
    return;
  }

  profileState = { ...profileState, loading: true, loadedForSubject: subject, error: '' };
  renderApp();

  try {
    const sections = await apiRequest<ProfileSections>('/api/customer/profile', session);
    profileState = {
      loadedForSubject: subject,
      loading: false,
      sections: sections ?? {},
      error: '',
    };
  } catch (error) {
    profileState = {
      loadedForSubject: subject,
      loading: false,
      sections: {},
      error: normalizeError(error).message,
    };
  }

  renderApp();
}

async function loadCertificatesFromApi(session: AuthSession, force = false): Promise<void> {
  const subject = claimToString(session.claims.sub) ?? 'anonymous';

  if (!force && certificatesState.loadedForSubject === subject) {
    return;
  }

  certificatesState = { ...certificatesState, loading: true, loadedForSubject: subject, error: '' };
  renderApp();

  try {
    const [docs, entries] = await Promise.all([
      apiRequest<Record<string, unknown>>('/api/customer/certificates/main-documents', session),
      apiRequest<CertificateEntries>('/api/customer/certificates/entries', session),
    ]);
    const mainDocuments: Record<string, boolean> = {};
    for (const key of Object.keys(docs ?? {})) {
      mainDocuments[key] = docs[key] === true;
    }
    certificatesState = {
      loadedForSubject: subject,
      loading: false,
      mainDocuments,
      entries: entries ?? {},
      error: '',
    };
  } catch (error) {
    certificatesState = {
      loadedForSubject: subject,
      loading: false,
      mainDocuments: {},
      entries: {},
      error: normalizeError(error).message,
    };
  }

  renderApp();
}

// ---------------------------------------------------------------------------
// Secure document sharing (docs/document-sharing-design.md).
//
// The owner pre-flags which uploaded files are shareable, then mints a secure
// link shown as a QR code. Anyone can scan it and, on the public recipient
// viewer (#/s/<token>), read the shareable files without signing in. Nothing
// snapshots a file subset — the recipient always sees the owner's *current*
// shareable set (design D1). See ShareController / PublicShareController.
// ---------------------------------------------------------------------------
type ShareableFile = {
  fileId: string;
  category: string | null;
  typeSlug: string | null;
  documentName: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number;
  expiryDate: string | null;
  shareable: boolean;
};

type ShareView = {
  shareId: string;
  status: string;
  allowDownload: boolean;
  recipientLabel: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  downloadCount: number;
  lastAccessedAt: string | null;
};

type CreatedShare = {
  shareId: string;
  token: string;
  expiresAt: string;
  allowDownload: boolean;
  recipientLabel: string | null;
};

type ShareState = {
  loadedForSubject: string | null;
  loading: boolean;
  error: string;
  files: ShareableFile[];
  shares: ShareView[];
  busy: boolean;
  lastCreated: CreatedShare | null;
  notice: string;
};

let shareState: ShareState = {
  loadedForSubject: null,
  loading: false,
  error: '',
  files: [],
  shares: [],
  busy: false,
  lastCreated: null,
  notice: '',
};

function resetShareState(): void {
  shareState = {
    loadedForSubject: null,
    loading: false,
    error: '',
    files: [],
    shares: [],
    busy: false,
    lastCreated: null,
    notice: '',
  };
}

// Build the recipient URL from the app's own origin so it is correct in every
// environment. The token lives in the fragment, so it never reaches server logs.
function buildShareUrl(token: string): string {
  return `${window.location.origin}/#/s/${token}`;
}

async function loadSharingFromApi(session: AuthSession, force = false): Promise<void> {
  const subject = claimToString(session.claims.sub) ?? 'anonymous';

  if (!force && shareState.loadedForSubject === subject) {
    return;
  }

  shareState = { ...shareState, loading: true, loadedForSubject: subject, error: '' };
  renderApp();

  try {
    const [files, shares] = await Promise.all([
      apiRequest<ShareableFile[]>('/api/customer/files/shareable', session),
      apiRequest<ShareView[]>('/api/customer/shares', session),
    ]);
    shareState = {
      ...shareState,
      loadedForSubject: subject,
      loading: false,
      files: files ?? [],
      shares: shares ?? [],
      error: '',
    };
  } catch (error) {
    shareState = {
      ...shareState,
      loadedForSubject: subject,
      loading: false,
      files: [],
      shares: [],
      error: normalizeError(error).message,
    };
  }

  renderApp();
}

async function toggleShareVisibility(fileId: string, shareable: boolean): Promise<void> {
  const session = getSession();
  if (!session) {
    return;
  }

  // Optimistic: reflect the toggle immediately, then confirm with the backend.
  shareState = {
    ...shareState,
    files: shareState.files.map((file) => (file.fileId === fileId ? { ...file, shareable } : file)),
    notice: '',
  };
  renderApp();

  try {
    await apiRequest('/api/customer/files/visibility', session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, shareable }),
    });
  } catch (error) {
    // Revert on failure.
    shareState = {
      ...shareState,
      files: shareState.files.map((file) =>
        file.fileId === fileId ? { ...file, shareable: !shareable } : file,
      ),
      error: normalizeError(error).message,
    };
    renderApp();
  }
}

async function createShareLink(): Promise<void> {
  const session = getSession();
  if (!session || shareState.busy) {
    return;
  }

  shareState = { ...shareState, busy: true, error: '', notice: '' };
  renderApp();

  try {
    const created = await apiRequest<CreatedShare>('/api/customer/shares', session, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowDownload: true }),
    });
    const shares = await apiRequest<ShareView[]>('/api/customer/shares', session);
    shareState = {
      ...shareState,
      busy: false,
      lastCreated: created,
      shares: shares ?? shareState.shares,
      notice: 'Secure link created. Show the QR code to the person you are sharing with.',
    };
  } catch (error) {
    shareState = { ...shareState, busy: false, error: normalizeError(error).message };
  }

  renderApp();
}

async function revokeShareLink(shareId: string): Promise<void> {
  const session = getSession();
  if (!session || shareState.busy) {
    return;
  }

  shareState = { ...shareState, busy: true, error: '', notice: '' };
  renderApp();

  try {
    await apiRequest(`/api/customer/shares/${encodeURIComponent(shareId)}/revoke`, session, {
      method: 'POST',
    });
    const shares = await apiRequest<ShareView[]>('/api/customer/shares', session);
    const lastCreated =
      shareState.lastCreated && shareState.lastCreated.shareId === shareId
        ? null
        : shareState.lastCreated;
    shareState = {
      ...shareState,
      busy: false,
      shares: shares ?? shareState.shares,
      lastCreated,
      notice: 'Link revoked. It can no longer be opened.',
    };
  } catch (error) {
    shareState = { ...shareState, busy: false, error: normalizeError(error).message };
  }

  renderApp();
}

async function copyShareLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    shareState = { ...shareState, notice: 'Link copied to clipboard.' };
  } catch {
    shareState = { ...shareState, notice: 'Copy failed — select and copy the link manually.' };
  }
  renderApp();
}

// Render any pending QR placeholders on the page from their data-qr-url. Uses a
// client-side library so the token is never sent to a third-party QR service.
async function renderPendingQrCodes(): Promise<void> {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-qr-url]:not([data-qr-done])'));
  if (targets.length === 0) {
    return;
  }
  try {
    const QRCode = await import('qrcode');
    for (const target of targets) {
      const url = target.dataset.qrUrl ?? '';
      if (!url) {
        continue;
      }
      const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
      target.dataset.qrDone = '1';
      target.innerHTML = `<img src="${dataUrl}" alt="QR code for the secure share link" width="220" height="220" />`;
    }
  } catch {
    for (const target of targets) {
      target.dataset.qrDone = '1';
      target.innerHTML =
        '<p class="share-qr-fallback">QR code could not be drawn. Use the link below instead.</p>';
    }
  }
}

function renderSharing(session: AuthSession | null): string {
  if (!session) {
    return renderAuthRequired('Share documents');
  }

  const subject = claimToString(session.claims.sub) ?? 'anonymous';

  if (shareState.loading && shareState.loadedForSubject !== subject) {
    return `<div class="portal-loading" role="status">Loading your documents…</div>`;
  }

  const loadError = shareState.error
    ? `<p class="alert alert-error portal-alert" role="status">
         <span>${escapeHtml(shareState.error)}</span>
         <button type="button" class="button button-ghost" data-action="retry-sharing">Retry</button>
       </p>`
    : '';

  const notice = shareState.notice
    ? `<p class="alert alert-success portal-alert" role="status">${escapeHtml(shareState.notice)}</p>`
    : '';

  const shareableCount = shareState.files.filter((file) => file.shareable).length;

  const fileRows = shareState.files.length
    ? shareState.files
        .map((file) => {
          const name = file.documentName || file.originalFilename || 'Document';
          const meta = [file.category ?? '', file.sizeBytes ? formatBytes(file.sizeBytes) : '']
            .filter(Boolean)
            .join(' · ');
          return `
            <label class="share-file">
              <input type="checkbox" data-share-file data-file-id="${escapeHtml(
                file.fileId,
              )}"${file.shareable ? ' checked' : ''} />
              <span class="share-file-body">
                <span class="share-file-name">${escapeHtml(name)}</span>
                <span class="share-file-meta">${escapeHtml(meta)}</span>
              </span>
            </label>`;
        })
        .join('')
    : `<p class="portal-hint">You have no uploaded documents yet. Add certificates first, then choose which to share.</p>`;

  const createDisabled = shareableCount === 0 || shareState.busy;
  const created = shareState.lastCreated;
  const createdBlock = created
    ? (() => {
        const url = buildShareUrl(created.token);
        return `
          <div class="share-created">
            <h4>Your secure QR link</h4>
            <p class="portal-hint">Anyone who scans this can view your ${shareableCount} shareable file(s)
              until it expires. It cannot be opened after that, and you can revoke it any time below.</p>
            <div class="share-qr" data-qr-url="${escapeHtml(url)}" aria-label="QR code">Generating QR…</div>
            <div class="share-link-row">
              <input class="share-link-input" type="text" readonly value="${escapeHtml(url)}" />
              <button type="button" class="button button-primary" data-action="copy-share-link"
                data-url="${escapeHtml(url)}">Copy link</button>
            </div>
            <p class="portal-hint">Expires ${escapeHtml(formatDateTime(created.expiresAt))}.</p>
          </div>`;
      })()
    : '';

  const activeShares = shareState.shares.length
    ? `<div class="share-list">
         <h4>Your share links</h4>
         ${shareState.shares.map((share) => renderShareRow(share)).join('')}
       </div>`
    : '';

  return `
    <div class="share-page">
      ${loadError}
      ${notice}
      <p class="portal-hint">
        Pick which uploaded documents can be shared, then generate a secure QR code. The person you share
        with scans it from any phone — no account needed — and sees only the files you marked shareable.
        Links expire automatically and can be revoked at any time.
      </p>

      <section class="share-section">
        <h3>Shareable documents</h3>
        <div class="share-files">${fileRows}</div>
      </section>

      <section class="share-section">
        <h3>Generate a secure link</h3>
        <p class="portal-hint">${shareableCount} document(s) marked shareable.</p>
        <button type="button" class="button button-primary" data-action="create-share"${
          createDisabled ? ' disabled' : ''
        }>${shareState.busy ? 'Working…' : 'Generate secure QR link'}</button>
        ${createdBlock}
      </section>

      ${activeShares}
    </div>
  `;
}

function renderShareRow(share: ShareView): string {
  const tone =
    share.status === 'ACTIVE' ? 'ok' : share.status === 'REVOKED' ? 'warn' : 'neutral';
  const canRevoke = share.status === 'ACTIVE';
  const label = share.recipientLabel ? escapeHtml(share.recipientLabel) : 'Secure link';
  return `
    <div class="share-row">
      <div class="share-row-main">
        <span class="share-row-label">${label}</span>
        <span class="admin-badge admin-badge-${tone}">${escapeHtml(share.status)}</span>
      </div>
      <div class="share-row-meta">
        <span>Created ${escapeHtml(formatDateTime(share.createdAt))}</span>
        <span>Expires ${escapeHtml(formatDateTime(share.expiresAt))}</span>
        <span>${share.viewCount} view(s) · ${share.downloadCount} download(s)</span>
      </div>
      ${
        canRevoke
          ? `<button type="button" class="button button-ghost" data-action="revoke-share"
               data-share-id="${escapeHtml(share.shareId)}">Revoke</button>`
          : ''
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Public recipient viewer (#/s/<token>) — anonymous, no session. Redeems the
// capability token for a short-lived share session, then lists/opens files.
// ---------------------------------------------------------------------------
type RecipientState = {
  loadedForToken: string | null;
  loading: boolean;
  error: string;
  gone: boolean;
  sessionToken: string | null;
  allowDownload: boolean;
  recipientLabel: string | null;
  expiresAt: string | null;
  files: ShareableFile[];
};

let recipientState: RecipientState = {
  loadedForToken: null,
  loading: false,
  error: '',
  gone: false,
  sessionToken: null,
  allowDownload: false,
  recipientLabel: null,
  expiresAt: null,
  files: [],
};

// Anonymous fetch for the recipient flow — no Authorization header (the Cognito
// resource-server filter would 401 a non-Cognito bearer token), optional
// X-Share-Session header, and friendly handling of 410 Gone / 401.
async function publicShareFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new Error('This share link cannot be opened here: the app is missing its API configuration.');
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, init);

  if (response.status === 410) {
    const message = await readApiError(response);
    const error = new Error(message) as Error & { gone?: boolean };
    error.gone = true;
    throw error;
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('The server returned an unexpected response.');
  }
  return (await response.json()) as T;
}

type RedeemResponse = {
  sessionToken: string;
  sessionExpiresAt: string;
  linkExpiresAt: string;
  allowDownload: boolean;
  recipientLabel: string | null;
  files: ShareableFile[];
};

async function redeemShare(token: string): Promise<void> {
  // Idempotent per token: once we've started handling this token, never restart.
  // redeemShare calls renderApp() below, which re-enters the #/s/ route and calls
  // bindSharedViewer → redeemShare again; without this guard that re-renders the
  // viewer repeatedly (tearing down the View/Download anchors mid-interaction —
  // the desktop "blinks on hover / click sometimes misses" symptom). A retry is a
  // page reload, which resets this state.
  if (recipientState.loadedForToken === token) {
    return;
  }

  recipientState = { ...recipientState, loadedForToken: token, loading: true, error: '', gone: false };
  renderApp();

  try {
    const result = await publicShareFetch<RedeemResponse>('/api/public/shares/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    recipientState = {
      ...recipientState,
      loading: false,
      error: '',
      gone: false,
      sessionToken: result.sessionToken,
      allowDownload: result.allowDownload,
      recipientLabel: result.recipientLabel,
      expiresAt: result.linkExpiresAt,
      files: result.files ?? [],
    };
  } catch (error) {
    const gone = Boolean((error as { gone?: boolean }).gone);
    recipientState = {
      ...recipientState,
      loading: false,
      error: normalizeError(error).message,
      gone,
      sessionToken: null,
      files: [],
    };
  }

  renderApp();
}

// Absolute URL of the backend's download-redirect endpoint for one file. Used as
// a plain anchor href so the browser navigates synchronously with the click.
function sharedFileUrl(fileId: string, download: boolean): string {
  const params = new URLSearchParams({
    fileId,
    session: recipientState.sessionToken ?? '',
    download: String(download),
  });
  return `${config.apiBaseUrl}/api/public/shares/files/download?${params.toString()}`;
}

function bindSharedViewer(token: string): void {
  void redeemShare(token);
}

function renderSharedViewer(): string {
  if (recipientState.loading) {
    return `<div class="share-viewer"><div class="portal-loading" role="status">Opening secure link…</div></div>`;
  }

  if (recipientState.gone || (recipientState.error && !recipientState.sessionToken)) {
    return `
      <div class="share-viewer">
        <div class="share-viewer-head">
          <h1>Shared documents</h1>
        </div>
        <p class="alert alert-error" role="status">
          ${escapeHtml(recipientState.error || 'This link is no longer available.')}
        </p>
        <p class="portal-hint">Ask the person who shared it to send you a new link.</p>
      </div>`;
  }

  const files = recipientState.files;
  const fileError = recipientState.error
    ? `<p class="alert alert-error" role="status">${escapeHtml(recipientState.error)}</p>`
    : '';

  const list = files.length
    ? files
        .map((file) => {
          const name = file.documentName || file.originalFilename || 'Document';
          const meta = [file.category ?? '', file.sizeBytes ? formatBytes(file.sizeBytes) : '']
            .filter(Boolean)
            .join(' · ');
          // Plain links to the backend's redirect endpoint: the browser opens a
          // new tab synchronously with the click (no fetch, no popup blocker), and
          // the server 302s to the presigned URL. target=_blank keeps this viewer.
          const downloadBtn = recipientState.allowDownload
            ? `<a class="button button-ghost" href="${escapeHtml(
                sharedFileUrl(file.fileId, true),
              )}" target="_blank" rel="noopener">Download</a>`
            : '';
          return `
            <div class="share-row">
              <div class="share-row-main">
                <span class="share-row-label">${escapeHtml(name)}</span>
              </div>
              <div class="share-row-meta"><span>${escapeHtml(meta)}</span></div>
              <div class="share-viewer-actions">
                <a class="button button-primary" href="${escapeHtml(
                  sharedFileUrl(file.fileId, false),
                )}" target="_blank" rel="noopener">View</a>
                ${downloadBtn}
              </div>
            </div>`;
        })
        .join('')
    : `<p class="portal-hint">There are no shared documents to show.</p>`;

  const heading = recipientState.recipientLabel
    ? `Shared documents for ${escapeHtml(recipientState.recipientLabel)}`
    : 'Shared documents';

  return `
    <div class="share-viewer">
      <div class="share-viewer-head">
        <h1>${heading}</h1>
        <p class="portal-hint">These documents were shared with you securely.${
          recipientState.expiresAt ? ` Access expires ${escapeHtml(formatDateTime(recipientState.expiresAt))}.` : ''
        }</p>
      </div>
      ${fileError}
      <div class="share-list">${list}</div>
    </div>
  `;
}

function savedSection(slug: string): Record<string, unknown> {
  return profileState.sections[slug] ?? {};
}

function savedString(section: Record<string, unknown>, key: string, fallback = ''): string {
  const value = section[key];
  return typeof value === 'string' ? value : fallback;
}

// Prefill main information from the loaded profile, falling back to Cognito claims.
function getMainInformation(session: AuthSession | null): MainInformation {
  const saved = savedSection('main');
  const claim = (key: string) => claimToString(session?.claims[key]);
  const fullName = displayName(session);
  const email = claimToString(session?.claims.email);
  const nameParts = fullName && fullName !== email ? fullName.split(/\s+/).filter(Boolean) : [];
  const offshore = saved.offshore;

  return {
    firstName: savedString(saved, 'firstName', claim('given_name') ?? nameParts[0] ?? ''),
    middleName: savedString(saved, 'middleName'),
    lastName: savedString(
      saved,
      'lastName',
      claim('family_name') ?? (nameParts.length > 1 ? nameParts.slice(1).join(' ') : ''),
    ),
    sex: savedString(saved, 'sex'),
    position: savedString(saved, 'position'),
    altPosition1: savedString(saved, 'altPosition1'),
    altPosition2: savedString(saved, 'altPosition2'),
    altPosition3: savedString(saved, 'altPosition3'),
    altPosition4: savedString(saved, 'altPosition4'),
    offshore: typeof offshore === 'boolean' ? offshore : false,
    dateOfReadiness: savedString(saved, 'dateOfReadiness'),
    minSalaryUsd: savedString(saved, 'minSalaryUsd'),
    citizenship: savedString(saved, 'citizenship'),
    placeOfBirth: savedString(saved, 'placeOfBirth'),
    dateOfBirth: savedString(saved, 'dateOfBirth', claim('birthdate') ?? ''),
    highestEducation: savedString(saved, 'highestEducation'),
    yearGraduated: savedString(saved, 'yearGraduated'),
    graduatedFrom: savedString(saved, 'graduatedFrom'),
    educationalLevel: savedString(saved, 'educationalLevel'),
  };
}

function getContactDetails(session: AuthSession | null): ContactDetails {
  const saved = savedSection('contact');
  const claim = (key: string) => claimToString(session?.claims[key]);

  return {
    email: savedString(saved, 'email', claim('email') ?? ''),
    mobilePhone1: savedString(saved, 'mobilePhone1', claim('phone_number') ?? ''),
    mobilePhone2: savedString(saved, 'mobilePhone2'),
    mobilePhone3: savedString(saved, 'mobilePhone3'),
    mobilePhone4: savedString(saved, 'mobilePhone4'),
    homeTelephone: savedString(saved, 'homeTelephone'),
  };
}

function getPassportDetails(): PassportDetails {
  const saved = savedSection('passport');

  return {
    passportNumber: savedString(saved, 'passportNumber'),
    passportIssueDate: savedString(saved, 'passportIssueDate'),
    passportExpiryDate: savedString(saved, 'passportExpiryDate'),
    seamanBookNumber: savedString(saved, 'seamanBookNumber'),
    seamanBookIssueDate: savedString(saved, 'seamanBookIssueDate'),
    seamanBookExpiryDate: savedString(saved, 'seamanBookExpiryDate'),
    individualTaxNumber: savedString(saved, 'individualTaxNumber'),
  };
}

function getAddressDetails(): AddressDetails {
  const saved = savedSection('address');

  return {
    country: savedString(saved, 'country'),
    province: savedString(saved, 'province'),
    city: savedString(saved, 'city'),
    postCode: savedString(saved, 'postCode'),
    street: savedString(saved, 'street'),
    houseNumber: savedString(saved, 'houseNumber'),
    apartmentNumber: savedString(saved, 'apartmentNumber'),
    mainAirportName: savedString(saved, 'mainAirportName'),
    mainAirportTravelTime: savedString(saved, 'mainAirportTravelTime'),
    altAirportName: savedString(saved, 'altAirportName'),
    altAirportTravelTime: savedString(saved, 'altAirportTravelTime'),
  };
}

function getLanguageLevels(): LanguageLevels {
  const saved = savedSection('languages');
  const levels: LanguageLevels = {};
  for (const language of LANGUAGES) {
    levels[language.slug] = savedString(saved, language.slug);
  }
  return levels;
}

function getProfessionalSkills(): ProfessionalSkills {
  const saved = savedSection('skills');
  const skills: ProfessionalSkills = {};
  for (const skill of PROFESSIONAL_SKILLS) {
    skills[skill.slug] = saved[skill.slug] === true;
  }
  return skills;
}

function getVisaDetails(): VisaDetails {
  const saved = savedSection('visas');
  const entries: VisaDetails['entries'] = {};
  for (const visa of VISAS) {
    entries[visa.slug] = {
      held: saved[`${visa.slug}Held`] === true,
      expiry: savedString(saved, `${visa.slug}Expiry`),
    };
  }
  return { entries, otherVisas: savedString(saved, 'otherVisas') };
}

function getMiscDetails(): MiscDetails {
  const saved = savedSection('misc');

  return {
    coverallSize: savedString(saved, 'coverallSize'),
    bodyWeight: savedString(saved, 'bodyWeight'),
    bodyHeight: savedString(saved, 'bodyHeight'),
    shoeSize: savedString(saved, 'shoeSize'),
    religion: savedString(saved, 'religion'),
    hairColor: savedString(saved, 'hairColor'),
    eyeColor: savedString(saved, 'eyeColor'),
    bloodType: savedString(saved, 'bloodType'),
    notes: savedString(saved, 'notes'),
  };
}

function getRelativesDetails(): RelativesDetails {
  const saved = savedSection('relatives');

  return {
    maritalStatus: savedString(saved, 'maritalStatus'),
    dateOfMarriage: savedString(saved, 'dateOfMarriage'),
    numberOfChildren: savedString(saved, 'numberOfChildren'),
    numberOfSons: savedString(saved, 'numberOfSons'),
    numberOfDaughters: savedString(saved, 'numberOfDaughters'),
    fatherFullName: savedString(saved, 'fatherFullName'),
    motherFullName: savedString(saved, 'motherFullName'),
    nokFirstName: savedString(saved, 'nokFirstName'),
    nokMiddleName: savedString(saved, 'nokMiddleName'),
    nokSurname: savedString(saved, 'nokSurname'),
    nokAddress: savedString(saved, 'nokAddress'),
    nokRelationDegree: savedString(saved, 'nokRelationDegree'),
    nokContactPhone: savedString(saved, 'nokContactPhone'),
    emergencyContactName: savedString(saved, 'emergencyContactName'),
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function firstConfigValue(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function resolveApiBaseUrl(...values: Array<string | undefined>): string {
  const configuredValue = firstConfigValue(...values);

  if (configuredValue) {
    return stripTrailingSlash(configuredValue);
  }

  return isLocalBrowser() ? 'http://localhost:8080' : window.location.origin;
}

function isLocalBrowser(): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function getCurrentPath(): string {
  const hashPath = window.location.hash.replace(/^#/, '');
  return hashPath.startsWith('/') ? hashPath : '/';
}

function setPath(path: string): void {
  window.location.hash = path;
}

function isCognitoConfigured(): boolean {
  return Boolean(config.cognitoUserPoolId && config.cognitoClientId);
}

function getUserPool(): CognitoUserPool {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito User Pool ID and app client ID are required.');
  }

  return new CognitoUserPool({
    UserPoolId: config.cognitoUserPoolId,
    ClientId: config.cognitoClientId,
  });
}

function getCognitoUser(email: string): CognitoUser {
  return new CognitoUser({
    Username: email,
    Pool: getUserPool(),
  });
}

function getSession(): AuthSession | null {
  const rawSession = window.sessionStorage.getItem(storageKeys.session);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as AuthSession;

    if (!session.accessToken || Date.now() >= session.expiresAt) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}

function saveSession(session: AuthSession): void {
  window.sessionStorage.setItem(storageKeys.session, JSON.stringify(session));
}

function clearSession(): void {
  window.sessionStorage.removeItem(storageKeys.session);
}

function startLogin(): void {
  authMode = 'signin';
  authNotice = '';
  setPath('/signin');
  renderApp();
}

function signInWithCognito(email: string, password: string): Promise<AuthSession> {
  if (!isCognitoConfigured()) {
    return Promise.reject(new Error('Cognito User Pool ID and app client ID are required.'));
  }

  const user = getCognitoUser(email);
  const authenticationDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  user.setAuthenticationFlowType('USER_SRP_AUTH');

  return new Promise((resolve, reject) => {
    user.authenticateUser(authenticationDetails, {
      onSuccess: (session) => resolve(createSessionFromCognito(session)),
      onFailure: (error: unknown) => reject(normalizeError(error)),
      newPasswordRequired: () => {
        reject(new Error('A new password is required before this account can continue.'));
      },
      mfaRequired: () => {
        reject(new Error('Multi-factor authentication is not supported in this frontend yet.'));
      },
      totpRequired: () => {
        reject(new Error('Authenticator app verification is not supported in this frontend yet.'));
      },
    });
  });
}

type SignUpProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  birthdate: string;
};

function signUpWithCognito(
  email: string,
  password: string,
  profile: SignUpProfile,
): Promise<ISignUpResult> {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
    ...(profile.firstName ? [new CognitoUserAttribute({ Name: 'given_name', Value: profile.firstName })] : []),
    ...(profile.lastName ? [new CognitoUserAttribute({ Name: 'family_name', Value: profile.lastName })] : []),
    ...(fullName ? [new CognitoUserAttribute({ Name: 'name', Value: fullName })] : []),
    ...(profile.phone ? [new CognitoUserAttribute({ Name: 'phone_number', Value: profile.phone })] : []),
    ...(profile.birthdate ? [new CognitoUserAttribute({ Name: 'birthdate', Value: profile.birthdate })] : []),
  ];

  return new Promise((resolve, reject) => {
    getUserPool().signUp(email, password, attributes, [], (error, result) => {
      if (error || !result) {
        reject(normalizeError(error));
        return;
      }
      resolve(result);
    });
  });
}

function confirmEmailWithCognito(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).confirmRegistration(code, true, (error) => {
      if (error) {
        reject(normalizeError(error));
        return;
      }
      resolve();
    });
  });
}

function resendVerificationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).resendConfirmationCode((error) => {
      if (error) {
        reject(normalizeError(error));
        return;
      }
      resolve();
    });
  });
}

function requestPasswordReset(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    getCognitoUser(email).forgotPassword({
      inputVerificationCode: () => {
        settled = true;
        resolve();
      },
      onSuccess: () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      },
      onFailure: (error) => {
        reject(normalizeError(error));
      },
    });
  });
}

function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getCognitoUser(email).confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (error) => reject(normalizeError(error)),
    });
  });
}

function createSessionFromCognito(cognitoSession: CognitoUserSession): AuthSession {
  const accessToken = cognitoSession.getAccessToken().getJwtToken();
  const idToken = cognitoSession.getIdToken().getJwtToken();
  const refreshToken = cognitoSession.getRefreshToken().getToken();
  const claims = decodeJwtClaims(idToken);

  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt: cognitoSession.getAccessToken().getExpiration() * 1000,
    claims,
  };
}

function decodeJwtClaims(token: string): UserClaims {
  const payload = token.split('.')[1];

  if (!payload) {
    return {};
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = decodeURIComponent(
      window
        .atob(padded)
        .split('')
        .map((character) => {
          const code = character.charCodeAt(0).toString(16).padStart(2, '0');
          return `%${code}`;
        })
        .join(''),
    );
    return JSON.parse(json) as UserClaims;
  } catch {
    return {};
  }
}

function replaceLocation(path: string): void {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = path;
  window.history.replaceState(null, '', url);
}

function signOut(): void {
  try {
    getUserPool().getCurrentUser()?.signOut();
  } catch {
    // Local session clearing still completes sign out when Cognito is not configured.
  }

  clearSession();
  resetProfileState();
  resetCertificatesState();
  resetShareState();
  setPath('/');
  renderApp();
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.code === 'string'
          ? candidate.code
          : 'Cognito request failed.';
    const normalized = new Error(message);
    normalized.name = typeof candidate.code === 'string' ? candidate.code : 'CognitoError';
    return normalized;
  }

  return new Error('Cognito request failed.');
}

// ---------------------------------------------------------------------------
// Admin console (/admin)
//
// A self-contained, staff-only dashboard that is entirely separate from the
// Cognito seafarer portal. It authenticates with the backend admin password
// (sent as the X-Admin-Password header on /api/admin/* requests) and lists
// registered users, their profile, their uploaded files, and activity.
//
// The admin password is kept in sessionStorage so a page refresh keeps the
// admin signed in. It is scoped to the tab session (closing the tab clears it)
// and re-validated against the backend on load — a pragmatic trade-off for a
// privileged tool.
// ---------------------------------------------------------------------------
type AdminStats = {
  totalUsers: number;
  totalFiles: number;
  totalStorageBytes: number;
  activeLast7Days: number;
  newFilesLast7Days: number;
};

type AdminUserSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  position: string | null;
  citizenship: string | null;
  profileSections: number;
  fileCount: number;
  storageBytes: number;
  firstSeen: string | null;
  lastActivity: string | null;
};

type AdminUsersPayload = {
  generatedAt: string;
  stats: AdminStats;
  users: AdminUserSummary[];
};

type AdminFileSummary = {
  certificateId: string;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number;
  uploadedAt: string | null;
  updatedAt: string | null;
  processingStatus: string | null;
  documentName: string | null;
  documentCategory: string | null;
  rank: string | null;
  expiryDate: string | null;
  issuer: string | null;
  certificateNumber: string | null;
  confidence: number | null;
  extractionSource: string | null;
  extractionNotes: string | null;
};

type AdminUserDetail = {
  userId: string;
  name: string | null;
  email: string | null;
  firstSeen: string | null;
  lastActivity: string | null;
  profile: Record<string, Record<string, unknown>>;
  files: AdminFileSummary[];
};

type AdminState = {
  password: string | null;
  authed: boolean;
  restoring: boolean;
  loading: boolean;
  error: string;
  data: AdminUsersPayload | null;
  search: string;
  selectedUserId: string | null;
  detail: AdminUserDetail | null;
  detailLoading: boolean;
  detailError: string;
  busyFileId: string | null;
};

const storedAdminPassword = window.sessionStorage.getItem(storageKeys.admin);

let adminState: AdminState = {
  password: storedAdminPassword,
  authed: false,
  restoring: Boolean(storedAdminPassword),
  loading: false,
  error: '',
  data: null,
  search: '',
  selectedUserId: null,
  detail: null,
  detailLoading: false,
  detailError: '',
  busyFileId: null,
};

const PROFILE_SECTION_TITLES: Record<string, string> = {
  main: 'Main information',
  contact: 'Contact details',
  passport: 'Passport & Seaman book',
  address: 'Address & Airport',
  languages: 'Languages',
  skills: 'Professional skills',
  visas: 'Visas',
  relatives: 'Relatives & next of kin',
  misc: 'Notes & miscellaneous',
};

const PROFILE_SECTION_ORDER = [
  'main',
  'contact',
  'passport',
  'address',
  'languages',
  'skills',
  'visas',
  'relatives',
  'misc',
];

async function adminApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new Error('Backend API URL is not configured for this deployment.');
  }
  if (!adminState.password) {
    throw new Error('Admin session expired. Sign in again.');
  }

  const headers = new Headers(init.headers);
  headers.set('X-Admin-Password', adminState.password);

  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });

  if (response.status === 401) {
    throw new Error('Incorrect admin password.');
  }
  if (response.status === 503) {
    // A 503 can mean either the admin password is unset on the backend, or a
    // downstream dependency (DynamoDB/S3) failed. Surface the backend's actual
    // message so data-store failures aren't misreported as an auth problem.
    const message = await readApiError(response);
    if (/not configured/i.test(message)) {
      throw new Error(
        'Admin access is not configured on the backend. Set SEAMARG_ADMIN_PASSWORD and restart the service.',
      );
    }
    throw new Error(message);
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return (await response.json()) as T;
}

function adminSignOut(): void {
  window.sessionStorage.removeItem(storageKeys.admin);
  adminState = {
    password: null,
    authed: false,
    restoring: false,
    loading: false,
    error: '',
    data: null,
    search: '',
    selectedUserId: null,
    detail: null,
    detailLoading: false,
    detailError: '',
    busyFileId: null,
  };
  renderApp();
}

// Re-validate a password restored from sessionStorage on page load. Runs once
// per load (guarded by adminState.restoring in the /admin route), so a failed
// or stale password quietly drops back to the sign-in screen.
async function bootstrapAdminSession(): Promise<void> {
  adminState = { ...adminState, loading: true };
  renderApp();

  try {
    const payload = await adminApiRequest<AdminUsersPayload>('/api/admin/users');
    adminState = { ...adminState, authed: true, restoring: false, loading: false, data: payload, error: '' };
  } catch {
    window.sessionStorage.removeItem(storageKeys.admin);
    adminState = { ...adminState, password: null, authed: false, restoring: false, loading: false, error: '' };
  }

  renderApp();
}

async function handleAdminLogin(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const username = String(data.get('username') ?? '').trim();
  const password = String(data.get('password') ?? '');

  if (!username || !password) {
    adminState = { ...adminState, error: 'Enter both the admin username and password.' };
    renderApp();
    return;
  }

  adminState = { ...adminState, password, loading: true, error: '' };
  renderApp();

  try {
    const payload = await adminApiRequest<AdminUsersPayload>('/api/admin/users');
    window.sessionStorage.setItem(storageKeys.admin, password);
    adminState = { ...adminState, authed: true, loading: false, data: payload, error: '' };
  } catch (error) {
    window.sessionStorage.removeItem(storageKeys.admin);
    adminState = {
      ...adminState,
      password: null,
      authed: false,
      loading: false,
      error: normalizeError(error).message,
    };
  }

  renderApp();
}

async function refreshAdminUsers(): Promise<void> {
  adminState = { ...adminState, loading: true, error: '' };
  renderApp();

  try {
    const payload = await adminApiRequest<AdminUsersPayload>('/api/admin/users');
    adminState = { ...adminState, loading: false, data: payload, error: '' };
  } catch (error) {
    adminState = { ...adminState, loading: false, error: normalizeError(error).message };
  }

  renderApp();

  // Also refresh the currently open candidate detail so its data reflects the
  // database, not the cached copy from when it was first opened.
  if (adminState.selectedUserId) {
    await selectAdminUser(adminState.selectedUserId);
  }
}

async function selectAdminUser(userId: string): Promise<void> {
  adminState = {
    ...adminState,
    selectedUserId: userId,
    detail: null,
    detailLoading: true,
    detailError: '',
  };
  renderApp();

  try {
    const detail = await adminApiRequest<AdminUserDetail>(
      `/api/admin/users/${encodeURIComponent(userId)}`,
    );
    adminState = { ...adminState, detail, detailLoading: false, detailError: '' };
  } catch (error) {
    adminState = { ...adminState, detailLoading: false, detailError: normalizeError(error).message };
  }

  renderApp();
}

async function openAdminFile(userId: string, certificateId: string, download: boolean): Promise<void> {
  adminState = { ...adminState, busyFileId: certificateId, detailError: '' };
  renderApp();

  try {
    const mode = download ? 'download' : 'view';
    const link = await adminApiRequest<{ url: string; mode: string }>(
      `/api/admin/users/${encodeURIComponent(userId)}/files/${encodeURIComponent(certificateId)}/link?mode=${mode}`,
    );
    window.open(link.url, '_blank', 'noopener');
    adminState = { ...adminState, busyFileId: null };
  } catch (error) {
    adminState = { ...adminState, busyFileId: null, detailError: normalizeError(error).message };
  }

  renderApp();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(iso);
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return escapeHtml(String(value));
  }
  return escapeHtml(JSON.stringify(value));
}

function renderAdminApp(): string {
  if (adminState.restoring) {
    return renderAdminRestoring();
  }
  if (!adminState.authed) {
    return renderAdminLogin();
  }
  return renderAdminDashboard();
}

function renderAdminRestoring(): string {
  return `
    <div class="admin-auth">
      <div class="admin-auth-card admin-auth-restoring">
        <div class="admin-auth-brand">
          <span class="admin-brand-mark">SM</span>
          <div>
            <strong>SeaMarg</strong>
            <small>Admin console</small>
          </div>
        </div>
        <p class="admin-auth-intro">Restoring your session…</p>
      </div>
    </div>
  `;
}

function renderAdminLogin(): string {
  const error = adminState.error
    ? `<p class="admin-alert admin-alert-error">${escapeHtml(adminState.error)}</p>`
    : '';
  const busy = adminState.loading;

  return `
    <div class="admin-auth">
      <form class="admin-auth-card" id="admin-login-form" novalidate>
        <div class="admin-auth-brand">
          <span class="admin-brand-mark">SM</span>
          <div>
            <strong>SeaMarg</strong>
            <small>Admin console</small>
          </div>
        </div>
        <h1>Restricted access</h1>
        <p class="admin-auth-intro">Sign in with your administrator credentials to manage users and documents.</p>
        ${error}
        <label class="admin-field">
          <span>Username</span>
          <input name="username" type="text" autocomplete="username" value="admin" required />
        </label>
        <label class="admin-field">
          <span>Password</span>
          <input name="password" type="password" autocomplete="current-password" required autofocus />
        </label>
        <button class="admin-button admin-button-primary" type="submit" ${busy ? 'disabled' : ''}>
          ${busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a class="admin-auth-back" href="#/">← Back to SeaMarg</a>
      </form>
    </div>
  `;
}

function renderAdminDashboard(): string {
  const stats = adminState.data?.stats;
  const generatedAt = adminState.data?.generatedAt ?? null;

  const statCards = stats
    ? [
        renderStatCard('Registered users', String(stats.totalUsers), 'with a profile or upload'),
        renderStatCard('Uploaded files', String(stats.totalFiles), formatBytes(stats.totalStorageBytes) + ' stored'),
        renderStatCard('Active (7 days)', String(stats.activeLast7Days), 'users with recent activity'),
        renderStatCard('New files (7 days)', String(stats.newFilesLast7Days), 'uploaded this week'),
      ].join('')
    : '';

  const globalError = adminState.error
    ? `<p class="admin-alert admin-alert-error">${escapeHtml(adminState.error)}
         <button type="button" class="admin-link" data-action="admin-refresh">Retry</button></p>`
    : '';

  return `
    <div class="admin-shell">
      <header class="admin-topbar">
        <div class="admin-topbar-brand">
          <span class="admin-brand-mark">SM</span>
          <div>
            <strong>SeaMarg</strong>
            <small>Admin console</small>
          </div>
        </div>
        <div class="admin-topbar-actions">
          <span class="admin-generated">${generatedAt ? 'Updated ' + formatDateTime(generatedAt) : ''}</span>
          <button type="button" class="admin-button admin-button-ghost" data-action="admin-refresh" ${
            adminState.loading ? 'disabled' : ''
          }>${adminState.loading ? 'Refreshing…' : 'Refresh'}</button>
          <button type="button" class="admin-button admin-button-ghost" data-action="admin-signout">Sign out</button>
        </div>
      </header>

      <section class="admin-stats">${statCards}</section>
      ${globalError}

      <div class="admin-body">
        <section class="admin-panel admin-users-panel">
          <div class="admin-panel-head">
            <h2>Registered users</h2>
            <input
              class="admin-search"
              id="admin-user-search"
              type="search"
              placeholder="Search name, email, position…"
              value="${escapeHtml(adminState.search)}"
              autocomplete="off"
            />
          </div>
          ${renderAdminUsersTable()}
        </section>
        <section class="admin-panel admin-detail-panel">
          ${renderAdminDetail()}
        </section>
      </div>
    </div>
  `;
}

function renderStatCard(label: string, value: string, hint: string): string {
  return `
    <div class="admin-stat-card">
      <span class="admin-stat-value">${escapeHtml(value)}</span>
      <span class="admin-stat-label">${escapeHtml(label)}</span>
      <span class="admin-stat-hint">${escapeHtml(hint)}</span>
    </div>
  `;
}

function renderAdminUsersTable(): string {
  const users = adminState.data?.users ?? [];

  if (adminState.loading && users.length === 0) {
    return `<p class="admin-empty">Loading users…</p>`;
  }
  if (users.length === 0) {
    return `<p class="admin-empty">No registered users yet.</p>`;
  }

  const rows = users
    .map((user) => {
      const selected = user.userId === adminState.selectedUserId ? ' is-selected' : '';
      const haystack = [user.name, user.email, user.position, user.citizenship, user.userId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return `
        <tr class="admin-user-row${selected}" data-action="admin-select-user" data-user-id="${escapeHtml(
          user.userId,
        )}" data-search="${escapeHtml(haystack)}">
          <td>
            <span class="admin-user-name">${escapeHtml(user.name ?? 'Unnamed user')}</span>
            <span class="admin-user-sub">${escapeHtml(user.email ?? user.userId)}</span>
          </td>
          <td>${escapeHtml(user.position ?? '—')}</td>
          <td class="admin-num">${user.profileSections}</td>
          <td class="admin-num">${user.fileCount}</td>
          <td class="admin-nowrap">${formatDateTime(user.lastActivity)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Position</th>
            <th class="admin-num">Sections</th>
            <th class="admin-num">Files</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody id="admin-user-rows">${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAdminDetail(): string {
  if (!adminState.selectedUserId) {
    return `<div class="admin-detail-empty">
      <p>Select a user to view their profile, uploaded files, and activity.</p>
    </div>`;
  }

  if (adminState.detailLoading) {
    return `<p class="admin-empty">Loading user…</p>`;
  }

  if (adminState.detailError) {
    return `<p class="admin-alert admin-alert-error">${escapeHtml(adminState.detailError)}
      <button type="button" class="admin-link" data-action="admin-select-user" data-user-id="${escapeHtml(
        adminState.selectedUserId,
      )}">Retry</button></p>`;
  }

  const detail = adminState.detail;
  if (!detail) {
    return `<p class="admin-empty">No data.</p>`;
  }

  return `
    <div class="admin-detail-head">
      <div>
        <h2>${escapeHtml(detail.name ?? 'Unnamed user')}</h2>
        <p class="admin-detail-meta">${escapeHtml(detail.email ?? '—')} · <span class="admin-mono">${escapeHtml(
          detail.userId,
        )}</span></p>
      </div>
      <button type="button" class="admin-button admin-button-ghost admin-detail-close" data-action="admin-close-detail">Close</button>
    </div>
    <div class="admin-detail-facts">
      <span><small>First seen</small>${formatDateTime(detail.firstSeen)}</span>
      <span><small>Last activity</small>${formatDateTime(detail.lastActivity)}</span>
      <span><small>Files</small>${detail.files.length}</span>
    </div>
    ${renderAdminFiles(detail)}
    ${renderAdminProfile(detail)}
  `;
}

function renderAdminFiles(detail: AdminUserDetail): string {
  if (detail.files.length === 0) {
    return `
      <div class="admin-detail-section">
        <h3>Uploaded files</h3>
        <p class="admin-empty">No files uploaded.</p>
      </div>
    `;
  }

  const items = detail.files
    .map((file) => {
      const busy = adminState.busyFileId === file.certificateId;
      const meta = [
        file.documentCategory ? humanizeKey(file.documentCategory) : null,
        file.contentType,
        formatBytes(file.sizeBytes),
      ]
        .filter(Boolean)
        .join(' · ');
      const extracted = [
        file.documentName ? `<span><small>Document</small>${escapeHtml(file.documentName)}</span>` : '',
        file.issuer ? `<span><small>Issuer</small>${escapeHtml(file.issuer)}</span>` : '',
        file.certificateNumber
          ? `<span><small>Number</small>${escapeHtml(file.certificateNumber)}</span>`
          : '',
        file.expiryDate ? `<span><small>Expiry</small>${formatDate(file.expiryDate)}</span>` : '',
      ]
        .filter(Boolean)
        .join('');

      return `
        <li class="admin-file">
          <div class="admin-file-main">
            <span class="admin-file-name">${escapeHtml(file.originalFilename ?? 'Document')}</span>
            <span class="admin-file-meta">${escapeHtml(meta)}</span>
            ${extracted ? `<div class="admin-file-extracted">${extracted}</div>` : ''}
          </div>
          <div class="admin-file-side">
            ${renderStatusBadge(file.processingStatus)}
            <span class="admin-file-date">${formatDateTime(file.uploadedAt)}</span>
            <div class="admin-file-actions">
              <button type="button" class="admin-button admin-button-small" data-action="admin-view-file"
                data-user-id="${escapeHtml(detail.userId)}" data-cert-id="${escapeHtml(file.certificateId)}" ${
                  busy ? 'disabled' : ''
                }>View</button>
              <button type="button" class="admin-button admin-button-small admin-button-ghost" data-action="admin-download-file"
                data-user-id="${escapeHtml(detail.userId)}" data-cert-id="${escapeHtml(file.certificateId)}" ${
                  busy ? 'disabled' : ''
                }>Download</button>
            </div>
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <div class="admin-detail-section">
      <h3>Uploaded files <span class="admin-count">${detail.files.length}</span></h3>
      <ul class="admin-file-list">${items}</ul>
    </div>
  `;
}

function renderStatusBadge(status: string | null): string {
  if (!status) {
    return '';
  }
  const normalized = status.toLowerCase();
  const tone =
    normalized === 'analyzed'
      ? 'ok'
      : normalized === 'analyzing'
        ? 'pending'
        : normalized === 'review_required'
          ? 'warn'
          : 'neutral';
  return `<span class="admin-badge admin-badge-${tone}">${escapeHtml(humanizeKey(status))}</span>`;
}

function renderAdminProfile(detail: AdminUserDetail): string {
  const slugs = Object.keys(detail.profile);
  if (slugs.length === 0) {
    return `
      <div class="admin-detail-section">
        <h3>Profile</h3>
        <p class="admin-empty">No profile sections saved.</p>
      </div>
    `;
  }

  const ordered = [
    ...PROFILE_SECTION_ORDER.filter((slug) => slugs.includes(slug)),
    ...slugs.filter((slug) => !PROFILE_SECTION_ORDER.includes(slug)),
  ];

  const sections = ordered
    .map((slug) => {
      const values = detail.profile[slug] ?? {};
      const rows = Object.entries(values)
        .map(
          ([key, value]) => `
            <div class="admin-kv">
              <dt>${escapeHtml(humanizeKey(key))}</dt>
              <dd>${formatFieldValue(value)}</dd>
            </div>
          `,
        )
        .join('');
      const title = PROFILE_SECTION_TITLES[slug] ?? humanizeKey(slug);
      return `
        <div class="admin-profile-section">
          <h4>${escapeHtml(title)}</h4>
          ${rows ? `<dl class="admin-kv-grid">${rows}</dl>` : '<p class="admin-empty">Empty.</p>'}
        </div>
      `;
    })
    .join('');

  return `
    <div class="admin-detail-section">
      <h3>Profile <span class="admin-count">${slugs.length}</span></h3>
      ${sections}
    </div>
  `;
}

function bindAdminPage(): void {
  const searchInput = document.querySelector<HTMLInputElement>('#admin-user-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      adminState.search = searchInput.value;
      document.querySelectorAll<HTMLElement>('#admin-user-rows .admin-user-row').forEach((row) => {
        const haystack = row.dataset.search ?? '';
        row.hidden = Boolean(query) && !haystack.includes(query);
      });
    });
  }
}

function renderApp(): void {
  const session = getSession();
  const path = getCurrentPath();

  // Admin console: standalone, staff-only, outside the Cognito portal shell.
  if (path === '/admin' || path.startsWith('/admin/')) {
    // Re-validate a password restored from sessionStorage exactly once per load.
    if (adminState.restoring && !adminState.loading) {
      void bootstrapAdminSession();
    }
    appRoot.innerHTML = renderAdminApp();
    bindAdminPage();
    return;
  }

  // Public recipient viewer for a shared link (#/s/<token>). Anonymous — no
  // session required; the capability token lives in the fragment.
  if (path.startsWith('/s/')) {
    const token = decodeURIComponent(path.slice('/s/'.length));
    appRoot.innerHTML = renderLayout(session, renderSharedViewer());
    bindSharedViewer(token);
    return;
  }

  if (path === '/signin' && session) {
    setPath(DEFAULT_PRIVATE_PATH);
    return;
  }

  // Account page: private, but rendered with its own layout (not the step shell).
  if (path === '/account') {
    if (!session) {
      appRoot.innerHTML = renderLayout(session, renderAuthRequired('Account'));
      bindCurrentPage(session);
      return;
    }

    appRoot.innerHTML = renderLayout(session, renderAccount(session));
    bindCurrentPage(session);
    return;
  }

  // Private seafarer portal (3-step profile builder).
  if (isPrivatePath(path)) {
    if (!session) {
      appRoot.innerHTML = renderLayout(session, renderAuthRequired('Your profile'));
      bindCurrentPage(session);
      return;
    }

    const view = resolvePrivateView(path);

    if (!view) {
      setPath(DEFAULT_PRIVATE_PATH);
      return;
    }

    // Normalize the URL so a bare step path (e.g. #/profile) shows its first sub-page.
    const canonicalPath = `${view.step.path}/${view.sub.slug}`;
    if (path !== canonicalPath) {
      replaceLocation(canonicalPath);
    }

    appRoot.innerHTML = renderLayout(session, renderPrivateArea(session, view.step, view.sub));
    bindCurrentPage(session);
    return;
  }

  // Public landing page — self-contained scrolling page (own header/footer).
  if (path === '/') {
    appRoot.innerHTML = renderLanding(session);
    bindLanding();
    return;
  }

  // Public routes.
  const route = publicRoutes.find((candidate) => candidate.path === path) ?? null;

  if (!route) {
    appRoot.innerHTML = renderLayout(session, renderNotFound());
    return;
  }

  appRoot.innerHTML = renderLayout(session, route.render(session));
  bindCurrentPage(session);
}

function renderLayout(session: AuthSession | null, page: string): string {
  const isSignedIn = Boolean(session);

  return `
    <header class="site-header">
      <a class="brand" href="#/" aria-label="SeaMarg home"><span class="dot"></span> SeaMarg</a>
      <button class="menu-toggle" type="button" aria-expanded="false" data-action="toggle-menu">
        Menu
      </button>
      <nav class="site-nav" aria-label="Primary navigation">
        ${
          isSignedIn
            ? ''
            : publicRoutes
                .filter((route) => route.nav === 'public')
                .map((route) => navLink(route.path, route.label))
                .join('')
        }
      </nav>
      <div class="header-actions">
        ${
          isSignedIn
            ? renderAccountMenu(session)
            : `<button class="button button-primary" type="button" data-action="login">Sign in</button>`
        }
      </div>
    </header>
    <main class="site-main">${page}</main>
    <footer class="site-footer">
      <div>
        <strong>SeaMarg</strong>
        <p>AI-powered career and compliance guidance for seafarers.</p>
      </div>
      <div class="footer-links">
        <a href="#/">Home</a>
      </div>
      <p class="fine-print">
        SeaMarg provides advisory guidance only. Final decisions depend on company policy, flag-state requirements, DG Shipping, MMD, and document verification.
      </p>
    </footer>
  `;
}

function navLink(path: string, label: string): string {
  const current = getCurrentPath();
  const active = current === path ? ' aria-current="page"' : '';
  return `<a href="#${path}"${active}>${label}</a>`;
}

// Single scrolling public landing page. Its nav tabs are in-page anchors that
// smooth-scroll to sections (see the 'scroll-to' action) rather than routes.
function renderLanding(session: AuthSession | null): string {
  const signedIn = Boolean(session);
  const navCta = signedIn
    ? `<button class="nav-cta" type="button" data-action="go-dashboard">Dashboard</button>`
    : `<button class="nav-cta" type="button" data-action="login">Sign in</button>`;
  const heroPrimary = signedIn
    ? `<button class="btn-primary" type="button" data-action="go-dashboard">Go to my dashboard</button>`
    : `<button class="btn-primary" type="button" data-action="login">Create my Sea Wallet</button>`;
  const joinPrimary = signedIn
    ? `<button class="btn-primary" type="button" data-action="go-dashboard">Go to my dashboard</button>`
    : `<button class="btn-primary" type="button" data-action="login">Create my Sea Wallet — Free</button>`;

  return `
  <div class="landing">
    <header>
      <a class="brand" href="#/" aria-label="SeaMarg home"><span class="dot"></span> SeaMarg</a>
      <nav aria-label="Primary navigation">
        <ul>
          <li><a href="#wallet" data-action="scroll-to" data-target="wallet">Sea Wallet</a></li>
          <li><a href="#courses" data-action="scroll-to" data-target="courses">Courses</a></li>
          <li><a href="#id" data-action="scroll-to" data-target="id">Crew ID</a></li>
          <li><a href="#renewals" data-action="scroll-to" data-target="renewals">Renewals</a></li>
          <li><a href="#notices" data-action="scroll-to" data-target="notices">DG Notices</a></li>
          <li><a href="#community" data-action="scroll-to" data-target="community">Community</a></li>
        </ul>
      </nav>
      ${navCta}
    </header>

    <section class="hero">
      <div class="hero-grid"></div>
      <svg class="compass" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <circle cx="100" cy="100" r="96" stroke="#C8952E" stroke-width="1"/>
        <circle cx="100" cy="100" r="70" stroke="#6E93A2" stroke-width="0.6"/>
        <path d="M100 20 L112 100 L100 180 L88 100 Z" fill="#C8952E" opacity="0.85"/>
        <path d="M20 100 L100 88 L180 100 L100 112 Z" fill="#6E93A2" opacity="0.5"/>
      </svg>
      <div class="eyebrow"><span class="ln"></span> A community built by seafarers, for seafarers</div>
      <h1>One <em>crew</em>.<br>Every shore.</h1>
      <p class="lede">SeaMarg keeps watch over your documents, your courses, your compliance and your career — so the only thing you have to focus on is the voyage. We're family on board. We stay family on shore.</p>
      <div class="hero-actions">
        ${heroPrimary}
        <button class="btn-ghost" type="button" data-action="scroll-to" data-target="wallet">See how it works</button>
      </div>
      <div class="hero-stats">
        <div><b>30·60·90</b><span>Day renewal alerts</span></div>
        <div><b>WhatsApp</b><span>Direct to your phone</span></div>
        <div><b>1 Scan</b><span>Full document access</span></div>
        <div><b>DG Shipping</b><span>Compliance, tracked</span></div>
      </div>
    </section>

    <div class="marquee">
      <div class="marquee-track">
        <span>SEA WALLET</span><span>★</span><span>COURSE BOOKING</span><span>★</span><span>CREW ID BARCODE</span><span>★</span><span>DOCUMENT RENEWAL</span><span>★</span><span>DG SHIPPING ALERTS</span><span>★</span>
        <span>SEA WALLET</span><span>★</span><span>COURSE BOOKING</span><span>★</span><span>CREW ID BARCODE</span><span>★</span><span>DOCUMENT RENEWAL</span><span>★</span><span>DG SHIPPING ALERTS</span><span>★</span>
      </div>
    </div>

    <section class="logbook" id="wallet">
      <div class="log-wrap">
        <div class="wallet-card reveal">
          <div class="wallet-row">
            <div class="doc"><b>Continuous Discharge Certificate</b><small>Issued — DG Shipping</small></div>
            <span class="pill ok">Valid</span>
          </div>
          <div class="wallet-row">
            <div class="doc"><b>STCW Basic Safety Training</b><small>Expires in 58 days</small></div>
            <span class="pill warn">60-day alert</span>
          </div>
          <div class="wallet-row">
            <div class="doc"><b>Medical Fitness Certificate</b><small>Expires in 12 days</small></div>
            <span class="pill due">90-day alert sent</span>
          </div>
          <div class="wallet-row">
            <div class="doc"><b>Seaman's Book</b><small>Expires in 81 days</small></div>
            <span class="pill ok">30-day watch</span>
          </div>
          <div class="wa-toast">
            <div class="wa-dot">✓</div>
            <div><b style="font-family:'Oswald', sans-serif; font-size:0.78rem; letter-spacing:0.04em;">SeaMarg</b><br>Your Medical Fitness Certificate expires in 12 days. Reply RENEW and we'll handle the rest. ⚓</div>
          </div>
        </div>
        <div class="log-copy reveal">
          <div class="tag">Feature 01 — The Sea Wallet</div>
          <h2 style="font-size:clamp(1.9rem,3.6vw,2.8rem); color:var(--paper);">Every document.<br>One folder. Zero surprises.</h2>
          <ul>
            <li><span class="num">1</span> A digital wallet holds every certificate, endorsement and license you carry — passport excluded, everything else included.</li>
            <li><span class="num">2</span> SeaMarg watches expiry dates around the clock and alerts you on WhatsApp at 90, 60 and 30 days out — no certificate ever sneaks up on you.</li>
            <li><span class="num">3</span> No more chasing scans in port. Your wallet travels with you, ship to ship, shore to shore.</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="courses">
      <div class="section-head reveal">
        <div class="tag">Feature 02 — Course Booking</div>
        <h2>Find your course. Or let us book it for you.</h2>
        <p>Tell us the certificate you need. We'll surface the nearest approved institute, show you live batch availability, and — if you'd rather not deal with the paperwork — book your seat for you.</p>
      </div>

      <div class="feature reveal">
        <div class="copy">
          <div class="index">/ Nearest Institute Match</div>
          <h3>We map the course to your coastline.</h3>
          <p>Search any DG-approved course and SeaMarg ranks institutes by distance from your home port, current batch openings, and seat availability — so you're not calling five places to find one slot.</p>
          <div class="chips">
            <span class="chip">Fire Fighting</span>
            <span class="chip">STCW Refresher</span>
            <span class="chip">GMDSS</span>
            <span class="chip">PSCRB</span>
          </div>
        </div>
        <div class="visual">
          <div class="vcard">
            <div class="photo-tile"><img src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80" alt="Instructor teaching a classroom training session"></div>
            <div class="course-list">
              <div class="course-item">
                <div><div class="ci-name">Advanced Fire Fighting</div><div class="ci-meta">Maritime Training Centre — 4.2 km</div></div>
                <div class="map-pin">3 seats left</div>
              </div>
              <div class="course-item">
                <div><div class="ci-name">STCW Refresher (5-yr)</div><div class="ci-meta">Coastal Skills Academy — 7.8 km</div></div>
                <div class="map-pin">Batch 14 Jul</div>
              </div>
              <div class="course-item">
                <div><div class="ci-name">GMDSS GOC</div><div class="ci-meta">Anchorage Institute — 11 km</div></div>
                <div class="map-pin">Book for me →</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="feature reverse reveal">
        <div class="copy">
          <div class="index">/ Book on your behalf</div>
          <h3>Hand it to us. We'll confirm your seat.</h3>
          <p>If you'd rather be home with family than on hold with an institute, say the word. Our team confirms the batch, completes the booking and sends your joining instructions straight to your wallet.</p>
        </div>
        <div class="visual">
          <div class="vcard">
            <div class="renew-stack">
              <div class="renew-row"><div class="check">✓</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">Institute selected</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Anchorage Institute, 11 km from home</div></div></div>
              <div class="renew-row"><div class="check">✓</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">Seat confirmed</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Batch starting 14 July</div></div></div>
              <div class="renew-row"><div class="check">✓</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">Joining letter issued</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Sent to your Sea Wallet</div></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="id" style="background:var(--navy);">
      <div class="feature reveal" style="border:none; padding-top:0;">
        <div class="copy">
          <div class="tag">Feature 03 — Crew ID</div>
          <h3 style="font-size:clamp(1.9rem,3.6vw,2.8rem);">One scan. Every document, instantly.</h3>
          <p>Your SeaMarg profile carries a unique barcode. Walk into any institute or shipping company, and one scan gives them secure, verified access to exactly the documents they've asked for — no folders, no photocopies, no waiting at the gate.</p>
          <div class="chips">
            <span class="chip">Instant verification</span>
            <span class="chip">No paper copies</span>
            <span class="chip">You control access</span>
          </div>
        </div>
        <div class="visual" style="position:relative;">
          <div class="id-card">
            <div class="id-top">
              <div class="id-photo"><img src="https://images.unsplash.com/photo-1583512603806-077998240c7a?auto=format&fit=crop&w=200&q=80" alt="Crew member"></div>
              <div>
                <div class="id-name">CAPT. R. MENEZES</div>
                <div class="id-rank">Master Mariner · SeaMarg ID #SM-44821</div>
              </div>
            </div>
            <div class="barcode"></div>
            <div class="barcode-label">SCAN TO VERIFY</div>
          </div>
          <div class="scan-line"></div>
        </div>
      </div>
    </section>

    <section id="renewals">
      <div class="feature reverse reveal">
        <div class="copy">
          <div class="index">/ Feature 04 — Document Renewals</div>
          <h3>We renew it. You stay at sea.</h3>
          <p>Beyond your passport, SeaMarg handles renewal of every DG Shipping document on your record — applications, follow-ups, collection. You get a WhatsApp message when it's done, not a stack of forms to chase between contracts.</p>
          <div class="chips">
            <span class="chip">COC / COE</span>
            <span class="chip">Seaman's Book</span>
            <span class="chip">Medical Certificate</span>
            <span class="chip">CDC</span>
          </div>
        </div>
        <div class="visual">
          <div class="vcard">
            <div class="renew-stack">
              <div class="renew-row"><div class="check">⟳</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">CDC Renewal — In progress</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Submitted to DG Shipping office</div></div></div>
              <div class="renew-row"><div class="check">✓</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">Medical Certificate — Collected</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Added to your Sea Wallet</div></div></div>
              <div class="renew-row"><div class="check">○</div><div><div style="font-family:'Oswald', sans-serif; font-size:0.85rem;">COC Revalidation — Scheduled</div><div style="font-size:0.7rem; color:var(--mist); margin-top:3px;">Begins 90 days before expiry</div></div></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="notices" style="background:var(--navy);">
      <div class="feature reveal" style="border:none; padding-top:0;">
        <div class="copy">
          <div class="tag">Feature 05 — DG Shipping Updates</div>
          <h3 style="font-size:clamp(1.9rem,3.6vw,2.8rem);">New rules don't catch you off guard.</h3>
          <p>Circulars, compliance changes, certification updates — the moment DG Shipping issues something new, it lands in plain language in your wallet and on WhatsApp, so you always sail compliant.</p>
        </div>
        <div class="visual">
          <div class="vcard">
            <div class="notice-feed">
              <div class="notice-item">
                <div class="notice-tag">Circular Update</div>
                <p>Revised validity period announced for Medical Fitness Certificates under the latest DG Shipping order.</p>
                <span class="date">2 days ago</span>
              </div>
              <div class="notice-item">
                <div class="notice-tag">Compliance</div>
                <p>New STCW endorsement format rolling out — existing certificates remain valid until renewal.</p>
                <span class="date">9 days ago</span>
              </div>
              <div class="notice-item">
                <div class="notice-tag">Advisory</div>
                <p>Updated guidelines issued for biometric Seaman's Book applications at regional offices.</p>
                <span class="date">3 weeks ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="photo-strip">
      <div class="strip-grid">
        <figure>
          <img src="https://images.unsplash.com/photo-1552207802-77bcb0d13122?auto=format&fit=crop&w=1200&q=80" alt="Ship at sea">
          <figcaption>On Board<span>Months at sea, watch after watch</span></figcaption>
        </figure>
        <figure>
          <img src="https://images.unsplash.com/photo-1779315215518-8dabd6432dcd?auto=format&fit=crop&w=900&q=80" alt="Ship officer in uniform">
          <figcaption>The Crew<span>Family, even far from home</span></figcaption>
        </figure>
        <figure>
          <img src="https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?auto=format&fit=crop&w=900&q=80" alt="Sailor working on ship deck">
          <figcaption>The Work<span>Skilled hands, every shift</span></figcaption>
        </figure>
      </div>
    </section>

    <section class="community" id="community">
      <div class="section-head reveal">
        <div class="tag">The Margo Family</div>
        <h2>We leave no one on the dock.</h2>
        <p>Every seafarer carries the same life — months at sea, families on shore, the same documents, the same deadlines. SeaMarg exists because that life deserves a crew that has your back on land, the way your shipmates have it on board.</p>
      </div>
      <div class="rope-divider"></div>
      <div class="crew-grid reveal">
        <div><b>30/60/90</b><span>Day alert rotation</span></div>
        <div><b>24/7</b><span>Wallet access</span></div>
        <div><b>Door to Port</b><span>Nearest institute matching</span></div>
        <div><b>Live</b><span>DG Shipping compliance feed</span></div>
      </div>
      <p class="quote reveal">"On board, we're family because we have to be. SeaMarg made sure we're family on shore too — someone watching the dates, the rules, the renewals, while we watch the sea."</p>
      <cite>— A SeaMarg seafarer, between contracts</cite>
    </section>

    <section class="cta-band" id="join">
      <h2>Your watch on shore starts today.</h2>
      <p>Open your Sea Wallet, get your Crew ID, and let SeaMarg stand the next watch on your documents.</p>
      ${joinPrimary}
    </section>

    <footer>
      <div class="foot-grid">
        <div class="foot-brand">
          <div class="brand"><span class="dot"></span>SeaMarg</div>
          <p>A community of seafarers, sailing under one watch — wherever in the world your ship may be.</p>
        </div>
        <div>
          <h4>PLATFORM</h4>
          <ul>
            <li><a href="#wallet" data-action="scroll-to" data-target="wallet">Sea Wallet</a></li>
            <li><a href="#courses" data-action="scroll-to" data-target="courses">Course Booking</a></li>
            <li><a href="#id" data-action="scroll-to" data-target="id">Crew ID</a></li>
            <li><a href="#renewals" data-action="scroll-to" data-target="renewals">Renewals</a></li>
          </ul>
        </div>
        <div>
          <h4>COMMUNITY</h4>
          <ul>
            <li><a href="#community" data-action="scroll-to" data-target="community">Our Story</a></li>
            <li><a href="#notices" data-action="scroll-to" data-target="notices">DG Notices</a></li>
            <li><a data-action="scroll-to">WhatsApp Support</a></li>
            <li><a data-action="scroll-to">Partner Institutes</a></li>
          </ul>
        </div>
        <div>
          <h4>CONTACT</h4>
          <ul>
            <li><a data-action="scroll-to">hello@seamarg.com</a></li>
            <li><a data-action="scroll-to">+91 00000 00000</a></li>
            <li><a data-action="scroll-to">WhatsApp Us</a></li>
          </ul>
        </div>
      </div>
      <div class="foot-bottom">
        <span>© 2026 SeaMarg. One crew, every shore.</span>
        <span>Built for the people who keep the world moving.</span>
      </div>
    </footer>
  </div>
  `;
}

function bindLanding(): void {
  landingRevealObserver?.disconnect();
  landingRevealObserver = null;

  const revealEls = Array.from(document.querySelectorAll<HTMLElement>('.landing .reveal'));

  if (revealEls.length === 0) {
    return;
  }

  if (!('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('show'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('show');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );

  revealEls.forEach((el) => observer.observe(el));
  landingRevealObserver = observer;
}

function renderSignIn(): string {
  return `
    <section class="auth-panel">
      <div>
        <p class="eyebrow">Cognito account access</p>
        <h1>${authHeading()}</h1>
        <p>${authIntro()}</p>
      </div>
      <div class="auth-card auth-card-wide">
        ${renderAuthNotice()}
        ${isCognitoConfigured() ? '' : renderMissingCognitoConfig()}
        ${renderAuthForm()}
      </div>
    </section>
  `;
}

function authHeading(): string {
  if (authMode === 'signup') {
    return 'Create your SeaMarg account.';
  }
  if (authMode === 'verify') {
    return 'Verify your email.';
  }
  if (authMode === 'forgot') {
    return 'Reset your password.';
  }
  if (authMode === 'reset') {
    return 'Enter your reset code.';
  }
  return 'Continue to SeaMarg.';
}

function authIntro(): string {
  if (authMode === 'signup') {
    return 'Create your SeaMarg account. Cognito will send a verification code to your email.';
  }
  if (authMode === 'verify') {
    return 'Enter the verification code sent by Cognito to activate your account.';
  }
  if (authMode === 'forgot') {
    return 'Enter your email and Cognito will send a password reset code.';
  }
  if (authMode === 'reset') {
    return 'Use the reset code from your email and choose a new password.';
  }
  return 'Sign in to access your dashboard, profile, and private SeaMarg pages.';
}

function renderAuthNotice(): string {
  if (!authNotice) {
    return '';
  }

  const noticeClass =
    authNoticeKind === 'error'
      ? 'alert-error'
      : authNoticeKind === 'warning'
        ? 'alert-warning'
        : authNoticeKind === 'success'
          ? 'alert-success'
          : 'alert-info';

  return `<p class="alert ${noticeClass}">${escapeHtml(authNotice)}</p>`;
}

function renderMissingCognitoConfig(): string {
  return `
    <p class="alert alert-warning">
      Cognito forms need the user pool ID and app client ID before account actions can run.
    </p>
    <p class="fine-print">
      Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID in frontend/.env.local.
    </p>
  `;
}

function renderAuthForm(): string {
  if (authMode === 'signup') {
    return `
      <form class="auth-form" id="auth-signup">
        ${inputField('firstName', 'First name (as in passport)', 'text', 'given-name')}
        ${inputField('lastName', 'Last name (as in passport)', 'text', 'family-name')}
        ${inputField('email', 'Email', 'email', 'email')}
        ${inputField('phone', 'Mobile phone (international format, e.g. +919892558621)', 'tel', 'tel')}
        ${inputField('birthdate', 'Birth date', 'date', 'bday')}
        ${inputField('password', 'Password', 'password', 'new-password', 12)}
        ${inputField('confirmPassword', 'Confirm password', 'password', 'new-password', 12)}
        <button class="button button-primary button-full" type="submit">Create account</button>
        <div class="auth-links">
          <span>Already have an account?</span>
          <button type="button" data-action="set-auth-mode" data-auth-mode="signin">Sign in</button>
          <button type="button" data-action="set-auth-mode" data-auth-mode="verify">I have a verification code</button>
        </div>
      </form>
    `;
  }

  if (authMode === 'verify') {
    return `
      <form class="auth-form" id="auth-verify">
        ${inputField('email', 'Email', 'email', 'email', undefined, pendingEmail)}
        ${inputField('code', 'Verification code', 'text', 'one-time-code')}
        <button class="button button-primary button-full" type="submit">Verify email</button>
        <button class="button button-ghost button-full" type="button" data-action="resend-code">Resend code</button>
        <div class="auth-links">
          <button type="button" data-action="set-auth-mode" data-auth-mode="signin">Back to sign in</button>
          <button type="button" data-action="set-auth-mode" data-auth-mode="signup">Create a new account</button>
        </div>
      </form>
    `;
  }

  if (authMode === 'forgot') {
    return `
      <form class="auth-form" id="auth-forgot">
        ${inputField('email', 'Email', 'email', 'email', undefined, pendingEmail)}
        <button class="button button-primary button-full" type="submit">Send reset code</button>
        <div class="auth-links">
          <button type="button" data-action="set-auth-mode" data-auth-mode="signin">Back to sign in</button>
        </div>
      </form>
    `;
  }

  if (authMode === 'reset') {
    return `
      <form class="auth-form" id="auth-reset">
        ${inputField('email', 'Email', 'email', 'email', undefined, pendingEmail)}
        ${inputField('code', 'Reset code', 'text', 'one-time-code')}
        ${inputField('password', 'New password', 'password', 'new-password', 12)}
        ${inputField('confirmPassword', 'Confirm new password', 'password', 'new-password', 12)}
        <button class="button button-primary button-full" type="submit">Reset password</button>
        <div class="auth-links">
          <button type="button" data-action="set-auth-mode" data-auth-mode="signin">Back to sign in</button>
        </div>
      </form>
    `;
  }

  return `
    <form class="auth-form auth-form-signin" id="auth-signin">
      <div class="auth-card-header">
        <div>
          <p class="auth-kicker">Secure access</p>
          <h2>Sign in</h2>
        </div>
        <p class="auth-switch">
          New user?
          <button class="text-button" type="button" data-action="set-auth-mode" data-auth-mode="signup">Create account</button>
        </p>
      </div>
      ${inputField('email', 'Email', 'email', 'email', undefined, pendingEmail)}
      <label class="field">
        <span class="field-label-row">
          <span>Password</span>
          <button class="field-action" type="button" data-action="set-auth-mode" data-auth-mode="forgot">Forgot password?</button>
        </span>
        <input name="password" type="password" autocomplete="current-password" required />
      </label>
      <button class="button button-primary button-full" type="submit">Sign in</button>
      <div class="auth-recovery">
        <span>Verification email already sent?</span>
        <button class="text-button" type="button" data-action="set-auth-mode" data-auth-mode="verify">Enter code</button>
      </div>
    </form>
  `;
}

function renderAuthRequired(label: string): string {
  return `
    <section class="auth-panel">
      <div>
        <p class="eyebrow">Private page</p>
        <h1>${escapeHtml(label)} requires sign in.</h1>
        <p>Use the SeaMarg Cognito login form to continue.</p>
      </div>
      <div class="auth-card">
        ${
          isCognitoConfigured()
            ? `<button class="button button-primary button-full" type="button" data-action="login">Sign in with Cognito</button>`
            : `<p class="alert alert-warning">Cognito login needs frontend environment values before it can redirect.</p>`
        }
      </div>
    </section>
  `;
}

function displayName(session: AuthSession | null): string {
  const name = claimToString(session?.claims.name) ?? claimToString(session?.claims.email);
  return name ?? 'Seafarer';
}

function firstName(session: AuthSession | null): string {
  const full = displayName(session);
  const email = claimToString(session?.claims.email);
  if (full === email && email) {
    return email.split('@')[0] ?? email;
  }
  return full.split(' ')[0] ?? full;
}

function initials(session: AuthSession | null): string {
  const name = displayName(session);
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join('') || 'SM';
}

function renderAccountMenu(session: AuthSession | null): string {
  return `
    <div class="account-menu${accountMenuOpen ? ' is-open' : ''}" data-account-menu>
      <button
        class="account-menu-trigger"
        type="button"
        data-action="toggle-account-menu"
        aria-haspopup="true"
        aria-expanded="${accountMenuOpen ? 'true' : 'false'}"
      >
        <span class="account-avatar" aria-hidden="true">${escapeHtml(initials(session))}</span>
        <span class="account-menu-name">${escapeHtml(firstName(session))}</span>
        <span class="account-menu-caret" aria-hidden="true">▾</span>
      </button>
      <div class="account-menu-panel" role="menu" ${accountMenuOpen ? '' : 'hidden'}>
        <a role="menuitem" href="#/account">Account</a>
        <button role="menuitem" type="button" data-action="logout">Log out</button>
      </div>
    </div>
  `;
}

function renderPrivateArea(
  session: AuthSession | null,
  step: PrivateStep,
  sub: PrivateSubPage,
): string {
  return `
    <div class="portal">
      ${renderPrivateStepper(step)}
      ${renderWelcomeBanner(session)}
      <section class="portal-shell">
        <aside class="portal-sidebar" aria-label="${escapeHtml(step.label)} sections">
          ${renderPrivateSubmenu(step, sub)}
        </aside>
        <section class="portal-main">
          ${renderPrivateSubPage(session, step, sub)}
        </section>
      </section>
    </div>
  `;
}

function renderPrivateStepper(activeStep: PrivateStep): string {
  const steps = privateSteps
    .map((step, index) => {
      const active = step.path === activeStep.path;
      return `
        <a
          class="portal-step${active ? ' is-active' : ''}"
          href="#${step.path}"
          ${active ? 'aria-current="step"' : ''}
        >
          <span class="portal-step-index" aria-hidden="true">${index + 1}</span>
          <span class="portal-step-icon" aria-hidden="true">${step.icon}</span>
          <span class="portal-step-label">${escapeHtml(step.label)}</span>
        </a>
      `;
    })
    .join('');

  return `<nav class="portal-stepper" aria-label="Profile steps">${steps}</nav>`;
}

function renderWelcomeBanner(session: AuthSession | null): string {
  if (welcomeBannerDismissed) {
    return '';
  }

  return `
    <div class="portal-banner" role="status">
      <div class="portal-banner-body">
        <p><strong>Welcome, ${escapeHtml(firstName(session))}.</strong> You've entered your personal account.</p>
        <p>Fill in each section and click <strong>Save</strong>. Complete, accurate, and up-to-date
        information improves your chances of getting a job. Keep validity dates current.</p>
      </div>
      <button class="portal-banner-close" type="button" data-action="dismiss-banner" aria-label="Dismiss welcome message">×</button>
    </div>
  `;
}

function renderPrivateSubmenu(step: PrivateStep, activeSub: PrivateSubPage): string {
  const links = step.subPages
    .map((page) => {
      const active = page.slug === activeSub.slug;
      return `
        <a
          class="portal-submenu-link${active ? ' is-active' : ''}"
          href="#${step.path}/${page.slug}"
          ${active ? 'aria-current="page"' : ''}
        >
          <span class="portal-submenu-icon" aria-hidden="true">${page.icon}</span>
          <span>${escapeHtml(page.label)}</span>
        </a>
      `;
    })
    .join('');

  const menu = `<nav class="portal-submenu" aria-label="${escapeHtml(step.label)}">${links}</nav>`;

  // Sea service records has extra controls above the submenu (per PRD §6).
  if (step.path === '/sea-service') {
    return `
      <div class="portal-sea-controls">
        <label class="portal-checkbox">
          <input type="checkbox" name="no-sea-service" disabled />
          <span>I have no sea service records (experience)</span>
        </label>
        <p class="portal-hint">Check this box if you currently do not have any sea service records.</p>
        <button class="button button-primary button-full" type="button" data-action="add-sea-service" disabled>
          + Add sea service record
        </button>
      </div>
      ${menu}
    `;
  }

  return menu;
}

function renderPrivateSubPage(
  session: AuthSession | null,
  step: PrivateStep,
  sub: PrivateSubPage,
): string {
  const head = `
    <div class="portal-page-head">
      <p class="eyebrow">${escapeHtml(step.label)}</p>
      <h1>${escapeHtml(sub.label)}</h1>
    </div>
  `;

  const body = renderPrivateSubPageBody(session, step, sub);

  return `${head}${renderPortalNotice(`${step.path}/${sub.slug}`)}${body}`;
}

function renderPrivateSubPageBody(
  session: AuthSession | null,
  step: PrivateStep,
  sub: PrivateSubPage,
): string {
  if (step.path === '/profile' && sub.slug === 'guide') {
    return renderProfileGuide(session);
  }

  if (step.path === '/profile' && sub.slug === 'main-information') {
    return renderMainInformationForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'contact-details') {
    return renderContactDetailsForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'passport') {
    return renderPassportForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'address') {
    return renderAddressForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'languages') {
    return renderLanguagesForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'professional-skills') {
    return renderProfessionalSkillsForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'visas') {
    return renderVisasForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'relatives') {
    return renderRelativesForm(session);
  }

  if (step.path === '/profile' && sub.slug === 'notes') {
    return renderMiscForm(session);
  }

  if (step.path === '/certificates' && sub.slug === 'guide') {
    return renderCertificatesGuide(session);
  }

  if (step.path === '/certificates' && sub.slug === 'main-documents') {
    return renderMainDocumentsForm(session);
  }

  if (step.path === '/certificates' && sub.slug === 'sharing') {
    return renderSharing(session);
  }

  if (step.path === '/certificates' && certificateCatalog(sub.slug).length > 0) {
    return renderCertificateCategory(session, sub.slug);
  }

  return `
    <div class="portal-placeholder" aria-label="${escapeHtml(sub.label)} workspace">
      <p class="portal-placeholder-title">This section is coming soon.</p>
      <p class="portal-placeholder-note">
        The <strong>${escapeHtml(sub.label)}</strong> page will be built in an upcoming step.
      </p>
    </div>
  `;
}

function renderPortalNotice(path: string): string {
  if (!portalNotice || portalNotice.path !== path) {
    return '';
  }

  const noticeClass =
    portalNotice.kind === 'error'
      ? 'alert-error'
      : portalNotice.kind === 'warning'
        ? 'alert-warning'
        : portalNotice.kind === 'success'
          ? 'alert-success'
          : 'alert-info';

  return `<p class="alert ${noticeClass} portal-alert" role="status">${escapeHtml(portalNotice.message)}</p>`;
}

// --- Form field helpers (label-left / control-right rows) --------------------
function portalFieldRow(id: string, label: string, control: string, required = false): string {
  return `
    <div class="portal-field">
      <label for="${id}">${escapeHtml(label)}${required ? ' <span class="req">*</span>' : ''}</label>
      <div class="portal-field-control">${control}</div>
    </div>
  `;
}

function portalTextControl(
  id: string,
  name: string,
  value: string,
  type = 'text',
  required = false,
): string {
  return `<input id="${id}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${required ? ' required' : ''} />`;
}

function portalSelectControl(
  id: string,
  name: string,
  value: string,
  options: string[],
  required = false,
  placeholder = 'Select',
): string {
  const opts = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(
      options.map(
        (option) =>
          `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`,
      ),
    )
    .join('');
  return `<select id="${id}" name="${escapeHtml(name)}"${required ? ' required' : ''}>${opts}</select>`;
}

function portalTextareaControl(id: string, name: string, value: string, rows = 4): string {
  return `<textarea id="${id}" name="${escapeHtml(name)}" rows="${rows}">${escapeHtml(value)}</textarea>`;
}

function portalCheckboxControl(id: string, name: string, checked: boolean): string {
  return `<input id="${id}" name="${escapeHtml(name)}" type="checkbox"${checked ? ' checked' : ''} />`;
}

function renderProfileGuide(session: AuthSession | null): string {
  const name = firstName(session);
  const greeting = name ? `Welcome, ${escapeHtml(name)}.` : 'Welcome.';

  return `
    <article class="portal-guide">
      <p class="portal-guide-lead">
        ${greeting} This section holds the personal data our crewing team uses to review your
        candidacy, complete joining formalities, book your flights, and prepare your contract.
        Accurate, complete, and up-to-date information gives you the best chance of being selected.
      </p>

      <h2 class="portal-form-section">How to fill it in</h2>
      <ul class="portal-guide-list">
        <li>Enter your names <strong>exactly as they appear in your passport</strong>, using Latin
          characters.</li>
        <li>Work through <strong>every sub-page</strong> in this section — the more complete your
          profile, the faster we can act on an opportunity.</li>
        <li>Each sub-page saves on its own: <strong>click Save before moving on</strong>. Fields
          marked with a red asterisk (<span class="req">*</span>) are required.</li>
        <li>Keep <strong>validity and expiry dates current</strong> (passport, seaman book, visas) so
          you stay eligible for assignments.</li>
        <li>You can return and <strong>edit any section at any time</strong>; there is nothing to
          submit — your profile is always live.</li>
      </ul>

      <p class="portal-guide-help">
        If you need assistance, please contact your assigned crewing officer.
      </p>
    </article>
  `;
}

function renderCertificatesGuide(session: AuthSession | null): string {
  const name = firstName(session);
  const greeting = name ? `Welcome, ${escapeHtml(name)}.` : 'Welcome.';

  return `
    <article class="portal-guide">
      <p class="portal-guide-lead">
        ${greeting} This section records your maritime certificates and documents. The more
        <strong>valid</strong> certificates you list, the stronger your profile — expired documents
        are not accepted.
      </p>

      <h2 class="portal-form-section">Two ways to enter certificates</h2>
      <ul class="portal-guide-list">
        <li><strong>Main documents</strong> — a quick checklist: tick every course or approval you
          currently hold.</li>
        <li><strong>Detailed categories</strong> — expand a certificate in a category and fill in its
          details (number, issue/expiry dates, place, issuing authority). You can attach a scan and we
          will read the details from it to save you typing.</li>
      </ul>

      <h2 class="portal-form-section">Categories</h2>
      <ul class="portal-guide-list">
        <li>Main documents</li>
        <li>General certificates</li>
        <li>National Certificates Of Competency</li>
        <li>Medical Certificates</li>
        <li>Tanker/Passenger certificates</li>
        <li>Offshore certificates</li>
        <li>Flag State Documents</li>
      </ul>

      <h2 class="portal-form-section">Good to know</h2>
      <ul class="portal-guide-list">
        <li><strong>Expired certificates are rejected</strong> — keep expiry dates current.</li>
        <li>Each certificate saves on its own; save before moving to the next.</li>
        <li>Use <strong>Expand filled</strong> and <strong>Collapse all</strong> to manage long lists.</li>
      </ul>

      <p class="portal-guide-help">
        If you need assistance, please contact your assigned crewing officer.
      </p>
    </article>
  `;
}

function renderMainDocumentsForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (certificatesState.loading && certificatesState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your certificates…</p>
      </div>
    `;
  }

  const loadError = certificatesState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved certificates: ${escapeHtml(certificatesState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-certificates">Retry</button>
       </div>`
    : '';

  const items = MAIN_DOCUMENTS.map((doc) => {
    const checked = certificatesState.mainDocuments[doc.slug] === true;
    return `
      <label class="portal-check-item" for="maindoc-${doc.slug}">
        <input id="maindoc-${doc.slug}" name="${escapeHtml(doc.slug)}" type="checkbox"${checked ? ' checked' : ''} />
        <span>${escapeHtml(doc.label)}</span>
      </label>
    `;
  }).join('');

  return `
    ${loadError}
    <form class="portal-form" id="certificates-main-documents-form" novalidate>
      <p class="portal-guide-lead">Tick every course, approval, or document you currently hold.</p>
      <div class="portal-check-grid">${items}</div>
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function getCertificateEntry(category: string, typeSlug: string): Record<string, unknown> {
  return certificatesState.entries[category]?.[typeSlug] ?? {};
}

// Field value for an entry form: saved value wins; otherwise fall back to an
// AI suggestion from a just-uploaded file (draft), else empty.
function certificateFieldValue(
  category: string,
  typeSlug: string,
  saved: Record<string, unknown>,
  field: string,
): string {
  const savedValue = savedString(saved, field);
  if (savedValue) {
    return savedValue;
  }
  const suggestion = certificateDrafts.get(`${category}:${typeSlug}`)?.extraction?.[field];
  return typeof suggestion === 'string' ? suggestion : '';
}

function renderCertificateCategory(session: AuthSession | null, category: string): string {
  const subject = claimToString(session?.claims.sub);

  if (certificatesState.loading && certificatesState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your certificates…</p>
      </div>
    `;
  }

  const loadError = certificatesState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved certificates: ${escapeHtml(certificatesState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-certificates">Retry</button>
       </div>`
    : '';

  const catalog = certificateCatalog(category);
  const rows = catalog.map((type) => renderCertificateEntry(category, type)).join('');
  const allExpanded =
    catalog.length > 0 && catalog.every((type) => expandedCertificates.has(`${category}:${type.slug}`));

  return `
    ${loadError}
    <p class="portal-guide-lead">
      Expand a certificate to fill in its details, then Save. Expired certificates are not accepted.
    </p>
    <div class="certificate-toolbar">
      <button class="button button-secondary button-small" type="button"
        data-action="toggle-all-certificates" data-cert-category="${escapeHtml(category)}">${allExpanded ? 'Collapse all' : 'Expand all'}</button>
      <button class="button button-secondary button-small" type="button"
        data-action="expand-filled-certificates" data-cert-category="${escapeHtml(category)}">Expand filled</button>
    </div>
    <div class="certificate-accordion">${rows}</div>
  `;
}

function renderCertificateEntry(category: string, type: CertificateType): string {
  const key = `${category}:${type.slug}`;
  const entry = getCertificateEntry(category, type.slug);
  const filled = Object.keys(entry).length > 0;
  const expanded = expandedCertificates.has(key);
  const idBase = `cert-${category}-${type.slug}`;

  const head = `
    <button
      type="button"
      class="certificate-entry-head"
      data-action="toggle-certificate"
      data-cert-key="${escapeHtml(key)}"
      aria-expanded="${expanded ? 'true' : 'false'}"
    >
      <span class="certificate-entry-title">${escapeHtml(type.label)}</span>
      ${filled ? '<span class="certificate-badge">Saved</span>' : ''}
      <span class="certificate-entry-caret" aria-hidden="true">▾</span>
    </button>
  `;

  const value = (field: string): string => certificateFieldValue(category, type.slug, entry, field);
  const extraFields = (CERTIFICATE_EXTRA_FIELDS[category] ?? [])
    .map((field) => {
      const control =
        field.type === 'select'
          ? portalSelectControl(`${idBase}-${field.key}`, field.key, value(field.key), field.options ?? [], field.required)
          : portalTextControl(`${idBase}-${field.key}`, field.key, value(field.key), 'text', field.required);
      return portalFieldRow(`${idBase}-${field.key}`, field.label, control, field.required);
    })
    .join('');
  const draft = certificateDrafts.get(key);
  const savedFile = entry.file && typeof entry.file === 'object' ? (entry.file as CertificateFileMeta) : undefined;
  const fileMeta = draft?.file ?? savedFile;
  const draftNote = draft?.note;

  const fileSection = `
    <div
      class="certificate-file"
      data-cert-dropzone
      data-cert-category="${escapeHtml(category)}"
      data-cert-type="${escapeHtml(type.slug)}"
    >
      <input
        id="${idBase}-file"
        class="certificate-file-input"
        type="file"
        accept=".pdf,image/*"
        data-cert-file
        data-cert-category="${escapeHtml(category)}"
        data-cert-type="${escapeHtml(type.slug)}"
      />
      <label class="certificate-dropzone" for="${idBase}-file">
        <span class="certificate-dropzone-icon" aria-hidden="true">⬆</span>
        <span class="certificate-dropzone-cta">Drag &amp; drop a scan here, or <span class="certificate-dropzone-browse">browse</span></span>
        <span class="certificate-dropzone-hint">PDF or image — we'll read the details for you to review.</span>
      </label>
      ${
        fileMeta?.originalFilename
          ? `<p class="certificate-file-current">Attached: <strong>${escapeHtml(fileMeta.originalFilename)}</strong>${
              savedFile?.objectKey
                ? ` · <button type="button" class="link-button" data-action="view-certificate-file" data-cert-category="${escapeHtml(category)}" data-cert-type="${escapeHtml(type.slug)}">View file</button>`
                  + ` · <button type="button" class="link-button" data-action="download-certificate-file" data-cert-category="${escapeHtml(category)}" data-cert-type="${escapeHtml(type.slug)}">Download</button>`
                : ' <span class="certificate-file-pending">(save to keep)</span>'
            }</p>`
          : ''
      }
      ${draftNote ? `<p class="portal-field-hint">${escapeHtml(draftNote)}</p>` : ''}
      ${
        draft
          ? `<p class="certificate-file-discard"><button type="button" class="link-button link-button-danger" data-action="discard-certificate-draft" data-cert-category="${escapeHtml(category)}" data-cert-type="${escapeHtml(type.slug)}">Discard &amp; upload a different file</button></p>`
          : ''
      }
    </div>
  `;

  const body = expanded
    ? `
      <div class="certificate-entry-body">
        <form
          class="portal-form certificate-entry-form"
          data-cert-category="${escapeHtml(category)}"
          data-cert-type="${escapeHtml(type.slug)}"
          novalidate
        >
          ${portalFieldRow(`${idBase}-number`, 'Number', portalTextControl(`${idBase}-number`, 'number', value('number')))}
          ${portalFieldRow(`${idBase}-issuedDate`, 'Issued Date', portalTextControl(`${idBase}-issuedDate`, 'issuedDate', value('issuedDate'), 'date', true), true)}
          ${portalFieldRow(`${idBase}-expiryDate`, 'Expiry Date', portalTextControl(`${idBase}-expiryDate`, 'expiryDate', value('expiryDate'), 'date'))}
          ${portalFieldRow(`${idBase}-issuePlace`, 'Issue Place', portalTextControl(`${idBase}-issuePlace`, 'issuePlace', value('issuePlace'), 'text', true), true)}
          ${portalFieldRow(`${idBase}-issuingAuthority`, 'Issuing Authority', portalTextControl(`${idBase}-issuingAuthority`, 'issuingAuthority', value('issuingAuthority'), 'text', true), true)}
          ${extraFields}
          ${fileSection}
          <div class="portal-form-actions">
            <button class="button button-primary" type="submit">Save</button>
          </div>
        </form>
      </div>
    `
    : '';

  return `<div class="certificate-entry${expanded ? ' is-open' : ''}${filled ? ' is-filled' : ''}">${head}${body}</div>`;
}

function renderMainInformationForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getMainInformation(session);
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-main-information-form" novalidate>
      ${portalFieldRow('mi-firstName', 'First name', portalTextControl('mi-firstName', 'firstName', data.firstName, 'text', true), true)}
      ${portalFieldRow('mi-middleName', 'Middle name', portalTextControl('mi-middleName', 'middleName', data.middleName))}
      ${portalFieldRow('mi-lastName', 'Last name', portalTextControl('mi-lastName', 'lastName', data.lastName, 'text', true), true)}
      ${portalFieldRow('mi-sex', 'Sex', portalSelectControl('mi-sex', 'sex', data.sex, SEX_OPTIONS))}
      ${portalFieldRow('mi-position', 'Position', portalSelectControl('mi-position', 'position', data.position, POSITION_OPTIONS))}
      ${portalFieldRow('mi-altPosition1', 'Alternate Position 1', portalSelectControl('mi-altPosition1', 'altPosition1', data.altPosition1, POSITION_OPTIONS))}
      ${portalFieldRow('mi-altPosition2', 'Alternate Position 2', portalSelectControl('mi-altPosition2', 'altPosition2', data.altPosition2, POSITION_OPTIONS))}
      ${portalFieldRow('mi-altPosition3', 'Alternate Position 3', portalSelectControl('mi-altPosition3', 'altPosition3', data.altPosition3, POSITION_OPTIONS))}
      ${portalFieldRow('mi-altPosition4', 'Alternate Position 4', portalSelectControl('mi-altPosition4', 'altPosition4', data.altPosition4, POSITION_OPTIONS))}
      ${portalFieldRow('mi-offshore', 'I want to work in Offshore (Oil/Gas) Industry', portalCheckboxControl('mi-offshore', 'offshore', data.offshore))}
      ${portalFieldRow('mi-dateOfReadiness', 'Date of readiness', portalTextControl('mi-dateOfReadiness', 'dateOfReadiness', data.dateOfReadiness, 'date'))}
      ${portalFieldRow('mi-minSalaryUsd', 'Minimum salary you can agree on (USD)', portalTextControl('mi-minSalaryUsd', 'minSalaryUsd', data.minSalaryUsd, 'number'))}
      ${portalFieldRow('mi-citizenship', 'Citizenship', portalSelectControl('mi-citizenship', 'citizenship', data.citizenship, CITIZENSHIP_OPTIONS))}
      ${portalFieldRow('mi-placeOfBirth', 'Place of Birth', portalTextControl('mi-placeOfBirth', 'placeOfBirth', data.placeOfBirth))}
      ${portalFieldRow('mi-dateOfBirth', 'Date of Birth', portalTextControl('mi-dateOfBirth', 'dateOfBirth', data.dateOfBirth, 'date', true), true)}
      ${portalFieldRow('mi-highestEducation', 'Highest education', portalSelectControl('mi-highestEducation', 'highestEducation', data.highestEducation, EDUCATION_OPTIONS))}
      ${portalFieldRow('mi-yearGraduated', 'Year you have graduated', portalTextControl('mi-yearGraduated', 'yearGraduated', data.yearGraduated, 'number'))}
      ${portalFieldRow('mi-graduatedFrom', 'Graduated from', portalTextControl('mi-graduatedFrom', 'graduatedFrom', data.graduatedFrom))}
      ${portalFieldRow('mi-educationalLevel', 'Educational level', portalTextControl('mi-educationalLevel', 'educationalLevel', data.educationalLevel))}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderContactDetailsForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getContactDetails(session);
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-contact-details-form" novalidate>
      ${portalFieldRow('cd-email', 'Email Address', portalTextControl('cd-email', 'email', data.email, 'email', true), true)}
      ${portalFieldRow('cd-mobilePhone1', 'Mobile Phone Number 1', portalTextControl('cd-mobilePhone1', 'mobilePhone1', data.mobilePhone1, 'tel', true), true)}
      ${portalFieldRow('cd-mobilePhone2', 'Mobile Phone Number 2', portalTextControl('cd-mobilePhone2', 'mobilePhone2', data.mobilePhone2, 'tel'))}
      ${portalFieldRow('cd-mobilePhone3', 'Mobile Phone Number 3', portalTextControl('cd-mobilePhone3', 'mobilePhone3', data.mobilePhone3, 'tel'))}
      ${portalFieldRow('cd-mobilePhone4', 'Mobile Phone Number 4', portalTextControl('cd-mobilePhone4', 'mobilePhone4', data.mobilePhone4, 'tel'))}
      ${portalFieldRow('cd-homeTelephone', 'Home Telephone Number', portalTextControl('cd-homeTelephone', 'homeTelephone', data.homeTelephone, 'tel'))}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderPassportForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getPassportDetails();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-passport-form" novalidate>
      ${portalFieldRow('pp-passportNumber', 'International Passport Number', portalTextControl('pp-passportNumber', 'passportNumber', data.passportNumber))}
      ${portalFieldRow('pp-passportIssueDate', 'International Passport Issue Date', portalTextControl('pp-passportIssueDate', 'passportIssueDate', data.passportIssueDate, 'date'))}
      ${portalFieldRow('pp-passportExpiryDate', 'Passport expiry date', portalTextControl('pp-passportExpiryDate', 'passportExpiryDate', data.passportExpiryDate, 'date'))}
      ${portalFieldRow('pp-seamanBookNumber', 'Seaman Book Number', portalTextControl('pp-seamanBookNumber', 'seamanBookNumber', data.seamanBookNumber))}
      ${portalFieldRow('pp-seamanBookIssueDate', 'Seaman Book Issue Date', portalTextControl('pp-seamanBookIssueDate', 'seamanBookIssueDate', data.seamanBookIssueDate, 'date'))}
      ${portalFieldRow('pp-seamanBookExpiryDate', 'Seaman Book Expiry Date', portalTextControl('pp-seamanBookExpiryDate', 'seamanBookExpiryDate', data.seamanBookExpiryDate, 'date'))}
      ${portalFieldRow('pp-individualTaxNumber', 'Individual Tax Number', portalTextControl('pp-individualTaxNumber', 'individualTaxNumber', data.individualTaxNumber))}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderAddressForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getAddressDetails();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-address-form" novalidate>
      <h2 class="portal-form-section">Address</h2>
      ${portalFieldRow('ad-country', 'Country', portalTextControl('ad-country', 'country', data.country))}
      ${portalFieldRow('ad-province', 'Province', portalTextControl('ad-province', 'province', data.province))}
      ${portalFieldRow('ad-city', 'City', portalTextControl('ad-city', 'city', data.city))}
      ${portalFieldRow('ad-postCode', 'Post Code', portalTextControl('ad-postCode', 'postCode', data.postCode))}
      ${portalFieldRow('ad-street', 'Street', portalTextControl('ad-street', 'street', data.street))}
      ${portalFieldRow('ad-houseNumber', 'House Number', portalTextControl('ad-houseNumber', 'houseNumber', data.houseNumber))}
      ${portalFieldRow('ad-apartmentNumber', 'Apartment Number', portalTextControl('ad-apartmentNumber', 'apartmentNumber', data.apartmentNumber))}
      <h2 class="portal-form-section">Airport</h2>
      ${portalFieldRow('ad-mainAirportName', 'Main Airport Name', portalTextControl('ad-mainAirportName', 'mainAirportName', data.mainAirportName))}
      ${portalFieldRow('ad-mainAirportTravelTime', 'Travel time to main airport (hours)', portalTextControl('ad-mainAirportTravelTime', 'mainAirportTravelTime', data.mainAirportTravelTime, 'number'))}
      ${portalFieldRow('ad-altAirportName', 'Alternative Airport Name', portalTextControl('ad-altAirportName', 'altAirportName', data.altAirportName))}
      ${portalFieldRow('ad-altAirportTravelTime', 'Travel time to alternative airport (hours)', portalTextControl('ad-altAirportTravelTime', 'altAirportTravelTime', data.altAirportTravelTime, 'number'))}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderLanguagesForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getLanguageLevels();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  const rows = LANGUAGES.map((language) =>
    portalFieldRow(
      `lang-${language.slug}`,
      language.label,
      portalSelectControl(
        `lang-${language.slug}`,
        language.slug,
        data[language.slug] ?? '',
        LANGUAGE_LEVEL_OPTIONS,
        false,
        'Select Level',
      ),
    ),
  ).join('');

  return `
    ${loadError}
    <form class="portal-form" id="profile-languages-form" novalidate>
      ${rows}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderProfessionalSkillsForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getProfessionalSkills();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  const rows = PROFESSIONAL_SKILLS.map((skill) =>
    portalFieldRow(
      `skill-${skill.slug}`,
      skill.label,
      portalCheckboxControl(`skill-${skill.slug}`, skill.slug, data[skill.slug] ?? false),
    ),
  ).join('');

  return `
    ${loadError}
    <form class="portal-form" id="profile-skills-form" novalidate>
      ${rows}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function portalVisaControl(slug: string, label: string, held: boolean, expiry: string): string {
  return `
    <div class="portal-visa-control">
      <label class="portal-inline-check">
        <input id="visa-${slug}-held" name="${escapeHtml(slug)}Held" type="checkbox"${held ? ' checked' : ''} />
        <span>Held</span>
      </label>
      <input
        name="${escapeHtml(slug)}Expiry"
        type="date"
        value="${escapeHtml(expiry)}"
        aria-label="${escapeHtml(label)} expiry date"
      />
    </div>
  `;
}

function renderVisasForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getVisaDetails();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  const rows = VISAS.map((visa) => {
    const entry = data.entries[visa.slug] ?? { held: false, expiry: '' };
    return portalFieldRow(
      `visa-${visa.slug}-held`,
      visa.label,
      portalVisaControl(visa.slug, visa.label, entry.held, entry.expiry),
    );
  }).join('');

  return `
    ${loadError}
    <form class="portal-form" id="profile-visas-form" novalidate>
      ${rows}
      ${portalFieldRow('visa-otherVisas', 'Other visas', portalTextControl('visa-otherVisas', 'otherVisas', data.otherVisas))}
      <p class="portal-field-hint">List other visas you have.</p>
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderRelativesForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getRelativesDetails();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-relatives-form" novalidate>
      <h2 class="portal-form-section">Relatives</h2>
      ${portalFieldRow('rk-maritalStatus', 'Marital Status', portalSelectControl('rk-maritalStatus', 'maritalStatus', data.maritalStatus, MARITAL_STATUS_OPTIONS))}
      ${portalFieldRow('rk-dateOfMarriage', 'Date of marriage', portalTextControl('rk-dateOfMarriage', 'dateOfMarriage', data.dateOfMarriage, 'date'))}
      ${portalFieldRow('rk-numberOfChildren', 'Number of children', portalTextControl('rk-numberOfChildren', 'numberOfChildren', data.numberOfChildren, 'number'))}
      ${portalFieldRow('rk-numberOfSons', 'Number of sons', portalTextControl('rk-numberOfSons', 'numberOfSons', data.numberOfSons, 'number'))}
      ${portalFieldRow('rk-numberOfDaughters', 'Number of daughters', portalTextControl('rk-numberOfDaughters', 'numberOfDaughters', data.numberOfDaughters, 'number'))}
      ${portalFieldRow('rk-fatherFullName', "Father's FULL NAME", portalTextControl('rk-fatherFullName', 'fatherFullName', data.fatherFullName))}
      ${portalFieldRow('rk-motherFullName', "Mother's FULL NAME", portalTextControl('rk-motherFullName', 'motherFullName', data.motherFullName))}
      <h2 class="portal-form-section">Next of Kin</h2>
      ${portalFieldRow('rk-nokFirstName', 'Next of Kin First Name', portalTextControl('rk-nokFirstName', 'nokFirstName', data.nokFirstName))}
      ${portalFieldRow('rk-nokMiddleName', 'Next of Kin Middle Name', portalTextControl('rk-nokMiddleName', 'nokMiddleName', data.nokMiddleName))}
      ${portalFieldRow('rk-nokSurname', 'Next of Kin Surname', portalTextControl('rk-nokSurname', 'nokSurname', data.nokSurname))}
      ${portalFieldRow('rk-nokAddress', 'Next of Kin Address', portalTextControl('rk-nokAddress', 'nokAddress', data.nokAddress))}
      ${portalFieldRow('rk-nokRelationDegree', 'Next of Kin Relation Degree', portalTextControl('rk-nokRelationDegree', 'nokRelationDegree', data.nokRelationDegree))}
      ${portalFieldRow('rk-nokContactPhone', 'Next of kin contact phone', portalTextControl('rk-nokContactPhone', 'nokContactPhone', data.nokContactPhone, 'tel'))}
      ${portalFieldRow('rk-emergencyContactName', 'Emergency Contact Name', portalTextControl('rk-emergencyContactName', 'emergencyContactName', data.emergencyContactName))}
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderMiscForm(session: AuthSession | null): string {
  const subject = claimToString(session?.claims.sub);

  if (profileState.loading && profileState.loadedForSubject !== subject) {
    return `
      <div class="portal-placeholder" aria-live="polite">
        <p class="portal-placeholder-title">Loading your profile…</p>
      </div>
    `;
  }

  const data = getMiscDetails();
  const loadError = profileState.error
    ? `<div class="alert alert-error portal-alert" role="status">
         <span>Could not load your saved profile: ${escapeHtml(profileState.error)}</span>
         <button class="button button-ghost" type="button" data-action="retry-profile">Retry</button>
       </div>`
    : '';

  return `
    ${loadError}
    <form class="portal-form" id="profile-misc-form" novalidate>
      ${portalFieldRow('ms-coverallSize', 'Working Coverall Size', portalTextControl('ms-coverallSize', 'coverallSize', data.coverallSize))}
      ${portalFieldRow('ms-bodyWeight', 'Body Weight (kg)', portalTextControl('ms-bodyWeight', 'bodyWeight', data.bodyWeight, 'number'))}
      ${portalFieldRow('ms-bodyHeight', 'Body Height (cm)', portalTextControl('ms-bodyHeight', 'bodyHeight', data.bodyHeight, 'number'))}
      ${portalFieldRow('ms-shoeSize', 'Working Shoe Size', portalTextControl('ms-shoeSize', 'shoeSize', data.shoeSize))}
      ${portalFieldRow('ms-religion', 'Religion', portalSelectControl('ms-religion', 'religion', data.religion, RELIGION_OPTIONS))}
      ${portalFieldRow('ms-hairColor', 'Hair color', portalSelectControl('ms-hairColor', 'hairColor', data.hairColor, HAIR_COLOR_OPTIONS))}
      ${portalFieldRow('ms-eyeColor', 'Eye color', portalSelectControl('ms-eyeColor', 'eyeColor', data.eyeColor, EYE_COLOR_OPTIONS))}
      ${portalFieldRow('ms-bloodType', 'Blood type', portalSelectControl('ms-bloodType', 'bloodType', data.bloodType, BLOOD_TYPE_OPTIONS))}
      ${portalFieldRow('ms-notes', 'Notes', portalTextareaControl('ms-notes', 'notes', data.notes))}
      <p class="portal-field-hint">Any information you want to indicate.</p>
      <div class="portal-form-actions">
        <button class="button button-primary" type="submit">Save</button>
      </div>
    </form>
  `;
}

function renderAccount(session: AuthSession | null): string {
  if (!session) {
    return renderAuthRequired('Account');
  }

  const email = claimToString(session.claims.email) ?? 'Signed-in user';
  const subject = claimToString(session.claims.sub) ?? 'Unavailable';

  return `
    <div class="portal">
      <section class="portal-shell portal-shell-single">
        <section class="portal-main">
          <div class="portal-page-head">
            <p class="eyebrow">Account</p>
            <h1>Your account</h1>
          </div>
          <div class="account-card">
            <dl>
              <div>
                <dt>Email</dt>
                <dd>${escapeHtml(email)}</dd>
              </div>
              <div>
                <dt>User ID</dt>
                <dd>${escapeHtml(subject)}</dd>
              </div>
            </dl>
            <div class="account-card-actions">
              <a class="button button-secondary" href="#${DEFAULT_PRIVATE_PATH}">Back to profile</a>
              <button class="button button-ghost" type="button" data-action="logout">Log out</button>
            </div>
          </div>
        </section>
      </section>
    </div>
  `;
}

function renderNotFound(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">404</p>
      <h1>Page not found.</h1>
      <p>The page you are looking for is not available.</p>
      <a class="button button-primary" href="#/">Return home</a>
    </section>
  `;
}

function inputField(
  name: string,
  label: string,
  type: string,
  autocomplete?: string,
  minLength?: number,
  value = '',
): string {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input
        name="${escapeHtml(name)}"
        type="${escapeHtml(type)}"
        ${autocomplete ? `autocomplete="${escapeHtml(autocomplete)}"` : ''}
        ${minLength ? `minlength="${minLength}"` : ''}
        value="${escapeHtml(value)}"
        required
      />
    </label>
  `;
}

function selectField(name: string, label: string, options: string[]): string {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(name)}" required>
        <option value="">Select</option>
        ${options.map((option) => `<option>${escapeHtml(option)}</option>`).join('')}
      </select>
    </label>
  `;
}

function textAreaField(name: string, label: string): string {
  return `
    <label class="field field-wide">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(name)}" rows="6" required></textarea>
    </label>
  `;
}

function claimToString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function bindCurrentPage(session: AuthSession | null): void {
  const searchInput = document.querySelector<HTMLInputElement>('#faq-search');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      document.querySelectorAll<HTMLElement>('[data-faq-item]').forEach((item) => {
        const searchableText = item.dataset.search ?? '';
        item.hidden = Boolean(query) && !searchableText.includes(query);
      });
    });
  }

  // Load the seafarer profile once when entering any "Your profile" page.
  if (session && getCurrentPath().startsWith('/profile')) {
    void loadProfileFromApi(session);
  }

  // Load certificates once when entering any "Certificates" page.
  if (session && getCurrentPath().startsWith('/certificates')) {
    void loadCertificatesFromApi(session);
  }

  // Load sharing data + draw any QR codes on the "Share documents" page.
  if (session && getCurrentPath().startsWith('/certificates/sharing')) {
    void loadSharingFromApi(session);
    void renderPendingQrCodes();
  }

  // Wire the shareable-file toggles on the "Share documents" page.
  document.querySelectorAll<HTMLInputElement>('input[data-share-file]').forEach((input) => {
    input.addEventListener('change', () => {
      const fileId = input.dataset.fileId ?? '';
      if (fileId) {
        void toggleShareVisibility(fileId, input.checked);
      }
    });
  });

  // Wire certificate file inputs (upload → AI read → prefill).
  document.querySelectorAll<HTMLInputElement>('input[data-cert-file]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      const category = input.dataset.certCategory ?? '';
      const typeSlug = input.dataset.certType ?? '';
      if (file && category && typeSlug) {
        void handleCertificateFileUpload(category, typeSlug, file);
      }
    });
  });

  // Drag-and-drop onto a certificate dropzone.
  document.querySelectorAll<HTMLElement>('[data-cert-dropzone]').forEach((zone) => {
    const stop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    zone.addEventListener('dragover', (event) => {
      stop(event);
      zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragleave', (event) => {
      stop(event);
      zone.classList.remove('is-dragover');
    });
    zone.addEventListener('drop', (event) => {
      stop(event);
      zone.classList.remove('is-dragover');
      const file = event.dataTransfer?.files?.[0];
      const category = zone.dataset.certCategory ?? '';
      const typeSlug = zone.dataset.certType ?? '';
      if (file && category && typeSlug) {
        void handleCertificateFileUpload(category, typeSlug, file);
      }
    });
  });
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === 'admin-login-form') {
    event.preventDefault();
    await handleAdminLogin(form);
    return;
  }

  if (form.id === 'profile-main-information-form') {
    event.preventDefault();
    await handleMainInformationSave(form);
    return;
  }

  if (form.id === 'profile-contact-details-form') {
    event.preventDefault();
    await handleContactDetailsSave(form);
    return;
  }

  if (form.id === 'profile-passport-form') {
    event.preventDefault();
    await handlePassportSave(form);
    return;
  }

  if (form.id === 'profile-address-form') {
    event.preventDefault();
    await handleAddressSave(form);
    return;
  }

  if (form.id === 'profile-languages-form') {
    event.preventDefault();
    await handleLanguagesSave(form);
    return;
  }

  if (form.id === 'profile-skills-form') {
    event.preventDefault();
    await handleProfessionalSkillsSave(form);
    return;
  }

  if (form.id === 'profile-visas-form') {
    event.preventDefault();
    await handleVisasSave(form);
    return;
  }

  if (form.id === 'profile-relatives-form') {
    event.preventDefault();
    await handleRelativesSave(form);
    return;
  }

  if (form.id === 'profile-misc-form') {
    event.preventDefault();
    await handleMiscSave(form);
    return;
  }

  if (form.id === 'certificates-main-documents-form') {
    event.preventDefault();
    await handleMainDocumentsSave(form);
    return;
  }

  if (form.classList.contains('certificate-entry-form')) {
    event.preventDefault();
    await handleCertificateEntrySave(form);
    return;
  }

  if (form.classList.contains('auth-form')) {
    event.preventDefault();
    await handleAuthSubmit(form);
    return;
  }

  if (form.classList.contains('form-card')) {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const message = form.querySelector<HTMLElement>('.form-message');

    if (message) {
      message.textContent =
        'Request prepared. Connect the approved backend or support channel to send it.';
    }
  }
}

function formCheckbox(form: HTMLFormElement, name: string): boolean {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.checked : false;
}

async function handleMainInformationSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: MainInformation = {
    firstName: getFormValue(form, 'firstName'),
    middleName: getFormValue(form, 'middleName'),
    lastName: getFormValue(form, 'lastName'),
    sex: getFormValue(form, 'sex'),
    position: getFormValue(form, 'position'),
    altPosition1: getFormValue(form, 'altPosition1'),
    altPosition2: getFormValue(form, 'altPosition2'),
    altPosition3: getFormValue(form, 'altPosition3'),
    altPosition4: getFormValue(form, 'altPosition4'),
    offshore: formCheckbox(form, 'offshore'),
    dateOfReadiness: getFormValue(form, 'dateOfReadiness'),
    minSalaryUsd: getFormValue(form, 'minSalaryUsd'),
    citizenship: getFormValue(form, 'citizenship'),
    placeOfBirth: getFormValue(form, 'placeOfBirth'),
    dateOfBirth: getFormValue(form, 'dateOfBirth'),
    highestEducation: getFormValue(form, 'highestEducation'),
    yearGraduated: getFormValue(form, 'yearGraduated'),
    graduatedFrom: getFormValue(form, 'graduatedFrom'),
    educationalLevel: getFormValue(form, 'educationalLevel'),
  };

  const path = '/profile/main-information';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>('/api/customer/profile/main', session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, main: saved ?? data },
    };
    portalNotice = { path, message: 'Main information saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleContactDetailsSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: ContactDetails = {
    email: getFormValue(form, 'email'),
    mobilePhone1: getFormValue(form, 'mobilePhone1'),
    mobilePhone2: getFormValue(form, 'mobilePhone2'),
    mobilePhone3: getFormValue(form, 'mobilePhone3'),
    mobilePhone4: getFormValue(form, 'mobilePhone4'),
    homeTelephone: getFormValue(form, 'homeTelephone'),
  };

  const path = '/profile/contact-details';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/contact',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, contact: saved ?? data },
    };
    portalNotice = { path, message: 'Contact details saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handlePassportSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: PassportDetails = {
    passportNumber: getFormValue(form, 'passportNumber'),
    passportIssueDate: getFormValue(form, 'passportIssueDate'),
    passportExpiryDate: getFormValue(form, 'passportExpiryDate'),
    seamanBookNumber: getFormValue(form, 'seamanBookNumber'),
    seamanBookIssueDate: getFormValue(form, 'seamanBookIssueDate'),
    seamanBookExpiryDate: getFormValue(form, 'seamanBookExpiryDate'),
    individualTaxNumber: getFormValue(form, 'individualTaxNumber'),
  };

  const path = '/profile/passport';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/passport',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, passport: saved ?? data },
    };
    portalNotice = { path, message: 'Passport and Seaman book saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleAddressSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: AddressDetails = {
    country: getFormValue(form, 'country'),
    province: getFormValue(form, 'province'),
    city: getFormValue(form, 'city'),
    postCode: getFormValue(form, 'postCode'),
    street: getFormValue(form, 'street'),
    houseNumber: getFormValue(form, 'houseNumber'),
    apartmentNumber: getFormValue(form, 'apartmentNumber'),
    mainAirportName: getFormValue(form, 'mainAirportName'),
    mainAirportTravelTime: getFormValue(form, 'mainAirportTravelTime'),
    altAirportName: getFormValue(form, 'altAirportName'),
    altAirportTravelTime: getFormValue(form, 'altAirportTravelTime'),
  };

  const path = '/profile/address';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/address',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, address: saved ?? data },
    };
    portalNotice = { path, message: 'Address and Airport saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleLanguagesSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: LanguageLevels = {};
  for (const language of LANGUAGES) {
    data[language.slug] = getFormValue(form, language.slug);
  }

  const path = '/profile/languages';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/languages',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, languages: saved ?? data },
    };
    portalNotice = { path, message: 'Languages saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleProfessionalSkillsSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: ProfessionalSkills = {};
  for (const skill of PROFESSIONAL_SKILLS) {
    data[skill.slug] = formCheckbox(form, skill.slug);
  }

  const path = '/profile/professional-skills';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/skills',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, skills: saved ?? data },
    };
    portalNotice = { path, message: 'Professional skills saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleVisasSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: Record<string, unknown> = {};
  for (const visa of VISAS) {
    data[`${visa.slug}Held`] = formCheckbox(form, `${visa.slug}Held`);
    data[`${visa.slug}Expiry`] = getFormValue(form, `${visa.slug}Expiry`);
  }
  data.otherVisas = getFormValue(form, 'otherVisas');

  const path = '/profile/visas';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>('/api/customer/profile/visas', session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, visas: saved ?? data },
    };
    portalNotice = { path, message: 'Visas saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleRelativesSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: RelativesDetails = {
    maritalStatus: getFormValue(form, 'maritalStatus'),
    dateOfMarriage: getFormValue(form, 'dateOfMarriage'),
    numberOfChildren: getFormValue(form, 'numberOfChildren'),
    numberOfSons: getFormValue(form, 'numberOfSons'),
    numberOfDaughters: getFormValue(form, 'numberOfDaughters'),
    fatherFullName: getFormValue(form, 'fatherFullName'),
    motherFullName: getFormValue(form, 'motherFullName'),
    nokFirstName: getFormValue(form, 'nokFirstName'),
    nokMiddleName: getFormValue(form, 'nokMiddleName'),
    nokSurname: getFormValue(form, 'nokSurname'),
    nokAddress: getFormValue(form, 'nokAddress'),
    nokRelationDegree: getFormValue(form, 'nokRelationDegree'),
    nokContactPhone: getFormValue(form, 'nokContactPhone'),
    emergencyContactName: getFormValue(form, 'emergencyContactName'),
  };

  const path = '/profile/relatives';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/profile/relatives',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, relatives: saved ?? data },
    };
    portalNotice = { path, message: 'Relatives and next of kin saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleMiscSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const data: MiscDetails = {
    coverallSize: getFormValue(form, 'coverallSize'),
    bodyWeight: getFormValue(form, 'bodyWeight'),
    bodyHeight: getFormValue(form, 'bodyHeight'),
    shoeSize: getFormValue(form, 'shoeSize'),
    religion: getFormValue(form, 'religion'),
    hairColor: getFormValue(form, 'hairColor'),
    eyeColor: getFormValue(form, 'eyeColor'),
    bloodType: getFormValue(form, 'bloodType'),
    notes: getFormValue(form, 'notes'),
  };

  const path = '/profile/notes';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>('/api/customer/profile/misc', session, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    profileState = {
      ...profileState,
      sections: { ...profileState.sections, misc: saved ?? data },
    };
    portalNotice = { path, message: 'Notes and miscellaneous saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleCertificateEntrySave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  const category = form.dataset.certCategory ?? '';
  const typeSlug = form.dataset.certType ?? '';
  const catalogEntry = certificateCatalog(category).find((type) => type.slug === typeSlug);
  const path = `/certificates/${category}`;

  if (!form.reportValidity()) {
    return;
  }

  const expiryDate = getFormValue(form, 'expiryDate');
  if (expiryDate && expiryDate < todayIsoDate()) {
    portalNotice = {
      path,
      message: 'Expiry date cannot be in the past; expired certificates are not accepted.',
      kind: 'error',
    };
    renderApp();
    return;
  }

  const key = `${category}:${typeSlug}`;
  const savedEntry = getCertificateEntry(category, typeSlug);
  const draftFile = certificateDrafts.get(key)?.file;
  const attachedFile =
    draftFile ?? (savedEntry.file && typeof savedEntry.file === 'object' ? savedEntry.file : undefined);

  const data: Record<string, unknown> = {
    number: getFormValue(form, 'number'),
    issuedDate: getFormValue(form, 'issuedDate'),
    expiryDate,
    issuePlace: getFormValue(form, 'issuePlace'),
    issuingAuthority: getFormValue(form, 'issuingAuthority'),
  };
  for (const field of CERTIFICATE_EXTRA_FIELDS[category] ?? []) {
    data[field.key] = getFormValue(form, field.key);
  }
  if (attachedFile) {
    data.file = attachedFile;
  }

  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      `/api/customer/certificates/${category}/${typeSlug}`,
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    const categoryEntries = { ...(certificatesState.entries[category] ?? {}) };
    categoryEntries[typeSlug] = saved ?? data;
    certificatesState = {
      ...certificatesState,
      entries: { ...certificatesState.entries, [category]: categoryEntries },
    };
    expandedCertificates.add(key);
    certificateDrafts.delete(key);
    const label = catalogEntry?.label ?? 'Certificate';
    portalNotice = { path, message: `${label} saved.`, kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function handleCertificateFileUpload(
  category: string,
  typeSlug: string,
  file: File,
): Promise<void> {
  const session = getSession();
  if (!session) {
    startLogin();
    return;
  }

  const key = `${category}:${typeSlug}`;
  const path = `/certificates/${category}`;
  expandedCertificates.add(key);
  portalNotice = { path, message: `Reading ${file.name}…`, kind: 'info' };
  renderApp();

  try {
    const formData = new FormData();
    formData.append('file', file);
    const result = await apiRequest<{
      extraction?: Record<string, string | null>;
      file?: CertificateFileMeta;
    }>(`/api/customer/certificates/${category}/${typeSlug}/file`, session, {
      method: 'POST',
      body: formData,
    });

    const extraction = result?.extraction ?? {};
    const draft: CertificateDraft = {
      extraction,
      note:
        typeof extraction.notes === 'string' && extraction.notes
          ? `AI suggestion: ${extraction.notes} Please review before saving.`
          : 'Attached. Review the details below, then Save.',
    };
    if (result?.file) {
      draft.file = result.file;
    }
    certificateDrafts.set(key, draft);
    portalNotice = { path, message: `Read ${file.name}. Review the details, then Save.`, kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function openCertificateFile(
  session: AuthSession,
  category: string,
  typeSlug: string,
  asAttachment = false,
): Promise<void> {
  const path = `/certificates/${category}`;
  try {
    const query = asAttachment ? '?disposition=attachment' : '';
    const result = await apiRequest<{ url?: string }>(
      `/api/customer/certificates/${category}/${typeSlug}/download-url${query}`,
      session,
    );
    if (!result?.url) {
      return;
    }
    if (asAttachment) {
      // The presigned URL carries Content-Disposition: attachment, so a plain
      // navigation triggers a download without leaving the page.
      const anchor = document.createElement('a');
      anchor.href = result.url;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } else {
      window.open(result.url, '_blank', 'noopener');
    }
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
    renderApp();
  }
}

async function handleMainDocumentsSave(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  const data: Record<string, boolean> = {};
  for (const doc of MAIN_DOCUMENTS) {
    data[doc.slug] = formCheckbox(form, doc.slug);
  }

  const path = '/certificates/main-documents';
  portalNotice = { path, message: 'Saving…', kind: 'info' };
  renderApp();

  try {
    const saved = await apiRequest<Record<string, unknown>>(
      '/api/customer/certificates/main-documents',
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    const mainDocuments: Record<string, boolean> = {};
    const source = saved ?? data;
    for (const key of Object.keys(source)) {
      mainDocuments[key] = source[key] === true;
    }
    certificatesState = { ...certificatesState, mainDocuments };
    portalNotice = { path, message: 'Main documents saved.', kind: 'success' };
  } catch (error) {
    portalNotice = { path, message: normalizeError(error).message, kind: 'error' };
  }

  renderApp();
}

async function apiRequest<T>(
  path: string,
  session: AuthSession,
  init: RequestInit = {},
): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new Error(
      'Backend API URL is not configured for this deployment. Set VITE_API_BASE_URL or use the CloudFront /api proxy and redeploy the frontend.',
    );
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearSession();
    throw new Error('Your session expired. Sign in again.');
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType.includes('application/json')) {
    const body = await response.text();
    const looksLikeHtml = body.trimStart().startsWith('<');
    throw new Error(
      looksLikeHtml
        ? 'Backend API returned the frontend HTML page instead of JSON. Check the CloudFront /api behavior points to the backend origin.'
        : `Backend API returned ${contentType || 'an unknown content type'} instead of JSON.`,
    );
  }

  return (await response.json()) as T;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall back to a generic status message below.
  }

  return `Request failed with status ${response.status}.`;
}

async function handleAuthSubmit(form: HTMLFormElement): Promise<void> {
  if (!form.reportValidity()) {
    return;
  }

  const email = getFormValue(form, 'email').toLowerCase();
  const password = getFormValue(form, 'password');
  const confirmPassword = getFormValue(form, 'confirmPassword');
  const code = getFormValue(form, 'code');

  try {
    setAuthNotice('Working with Cognito...', 'info', false);

    if (form.id === 'auth-signin') {
      const session = await signInWithCognito(email, password);
      saveSession(session);
      pendingEmail = '';
      pendingPasswordForAutoSignIn = '';
      replaceLocation('/profile');
      renderApp();
      return;
    }

    if (form.id === 'auth-signup') {
      if (password !== confirmPassword) {
        setAuthNotice('Passwords do not match.', 'error');
        return;
      }

      const phone = getFormValue(form, 'phone');
      if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
        setAuthNotice(
          'Enter your mobile phone in international format, e.g. +919892558621.',
          'error',
        );
        return;
      }

      const result = await signUpWithCognito(email, password, {
        firstName: getFormValue(form, 'firstName'),
        lastName: getFormValue(form, 'lastName'),
        phone,
        birthdate: getFormValue(form, 'birthdate'),
      });
      pendingEmail = email;
      pendingPasswordForAutoSignIn = password;

      if (result.userConfirmed) {
        const session = await signInWithCognito(email, password);
        saveSession(session);
        replaceLocation('/profile');
        renderApp();
        return;
      }

      setAuthMode(
        'verify',
        'Verification email sent by Cognito. Enter the code to confirm your email.',
        'success',
      );
      return;
    }

    if (form.id === 'auth-verify') {
      await confirmEmailWithCognito(email, code);
      pendingEmail = email;

      if (pendingPasswordForAutoSignIn) {
        const session = await signInWithCognito(email, pendingPasswordForAutoSignIn);
        saveSession(session);
        pendingPasswordForAutoSignIn = '';
        replaceLocation('/profile');
        renderApp();
        return;
      }

      setAuthMode('signin', 'Email verified. Sign in to continue.', 'success');
      return;
    }

    if (form.id === 'auth-forgot') {
      await requestPasswordReset(email);
      pendingEmail = email;
      setAuthMode('reset', 'Password reset code sent by Cognito. Enter the code below.', 'success');
      return;
    }

    if (form.id === 'auth-reset') {
      if (password !== confirmPassword) {
        setAuthNotice('Passwords do not match.', 'error');
        return;
      }

      await confirmPasswordReset(email, code, password);
      pendingEmail = email;
      setAuthMode('signin', 'Password reset. Sign in with your new password.', 'success');
    }
  } catch (error) {
    const normalized = normalizeError(error);

    if (normalized.name === 'UserNotConfirmedException') {
      pendingEmail = email;
      setAuthMode(
        'verify',
        'Your email is not verified yet. Enter the Cognito verification code to continue.',
        'warning',
      );
      return;
    }

    setAuthNotice(normalized.message, 'error');
  }
}

function getFormValue(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}

// Local calendar date as YYYY-MM-DD (matches <input type="date"> values).
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function setAuthMode(mode: AuthMode, notice = '', kind: NoticeKind = 'info'): void {
  authMode = mode;
  authNotice = notice;
  authNoticeKind = kind;
  setPath('/signin');
  renderApp();
}

function setAuthNotice(notice: string, kind: NoticeKind, rerender = true): void {
  authNotice = notice;
  authNoticeKind = kind;

  if (rerender) {
    renderApp();
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const actionElement = target.closest<HTMLElement>('[data-action]');
  const action = actionElement?.dataset.action;

  // Close the account menu on any click that is not the menu trigger itself.
  if (accountMenuOpen && action !== 'toggle-account-menu') {
    accountMenuOpen = false;
    if (!action) {
      renderApp();
      return;
    }
  }

  if (!action) {
    return;
  }

  // Landing page: nav tabs / footer links smooth-scroll to a same-page section
  // instead of navigating. preventDefault keeps the hash (and router) untouched.
  if (action === 'scroll-to') {
    event.preventDefault();
    const targetId = actionElement.dataset.target;
    if (targetId) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  if (action === 'go-dashboard') {
    setPath(DEFAULT_PRIVATE_PATH);
    return;
  }

  if (action === 'admin-refresh') {
    void refreshAdminUsers();
    return;
  }

  if (action === 'admin-signout') {
    adminSignOut();
    return;
  }

  if (action === 'admin-select-user') {
    const userId = actionElement.getAttribute('data-user-id');
    if (userId) {
      void selectAdminUser(userId);
    }
    return;
  }

  if (action === 'admin-close-detail') {
    adminState = { ...adminState, selectedUserId: null, detail: null, detailError: '' };
    renderApp();
    return;
  }

  if (action === 'admin-view-file' || action === 'admin-download-file') {
    const userId = actionElement.getAttribute('data-user-id');
    const certId = actionElement.getAttribute('data-cert-id');
    if (userId && certId) {
      void openAdminFile(userId, certId, action === 'admin-download-file');
    }
    return;
  }

  if (action === 'toggle-account-menu') {
    accountMenuOpen = !accountMenuOpen;
    renderApp();
    return;
  }

  if (action === 'dismiss-banner') {
    welcomeBannerDismissed = true;
    window.sessionStorage.setItem(storageKeys.bannerDismissed, '1');
    renderApp();
    return;
  }

  if (action === 'login') {
    startLogin();
  }

  if (action === 'logout') {
    signOut();
  }

  if (action === 'set-auth-mode') {
    const mode = actionElement.dataset.authMode;

    if (isAuthMode(mode)) {
      setAuthMode(mode);
    }
  }

  if (action === 'resend-code') {
    void handleResendCode();
  }

  if (action === 'retry-profile') {
    const session = getSession();
    if (session) {
      void loadProfileFromApi(session, true);
    }
  }

  if (action === 'retry-certificates') {
    const session = getSession();
    if (session) {
      void loadCertificatesFromApi(session, true);
    }
  }

  if (action === 'retry-sharing') {
    const session = getSession();
    if (session) {
      void loadSharingFromApi(session, true);
    }
    return;
  }

  if (action === 'create-share') {
    void createShareLink();
    return;
  }

  if (action === 'revoke-share') {
    const shareId = actionElement.getAttribute('data-share-id');
    if (shareId) {
      void revokeShareLink(shareId);
    }
    return;
  }

  if (action === 'copy-share-link') {
    const url = actionElement.getAttribute('data-url');
    if (url) {
      void copyShareLink(url);
    }
    return;
  }


  if (action === 'toggle-certificate') {
    const key = actionElement.getAttribute('data-cert-key');
    if (key) {
      if (expandedCertificates.has(key)) {
        expandedCertificates.delete(key);
      } else {
        expandedCertificates.add(key);
      }
      renderApp();
    }
  }

  if (action === 'toggle-all-certificates') {
    const category = actionElement.getAttribute('data-cert-category');
    if (category) {
      const catalog = certificateCatalog(category);
      const allExpanded =
        catalog.length > 0 && catalog.every((type) => expandedCertificates.has(`${category}:${type.slug}`));
      for (const type of catalog) {
        const key = `${category}:${type.slug}`;
        if (allExpanded) {
          expandedCertificates.delete(key);
        } else {
          expandedCertificates.add(key);
        }
      }
      renderApp();
    }
  }

  if (action === 'expand-filled-certificates') {
    const category = actionElement.getAttribute('data-cert-category');
    if (category) {
      for (const type of certificateCatalog(category)) {
        if (Object.keys(getCertificateEntry(category, type.slug)).length > 0) {
          expandedCertificates.add(`${category}:${type.slug}`);
        }
      }
      renderApp();
    }
  }

  if (action === 'view-certificate-file' || action === 'download-certificate-file') {
    const category = actionElement.getAttribute('data-cert-category');
    const typeSlug = actionElement.getAttribute('data-cert-type');
    const session = getSession();
    if (session && category && typeSlug) {
      void openCertificateFile(session, category, typeSlug, action === 'download-certificate-file');
    }
  }

  if (action === 'discard-certificate-draft') {
    const category = actionElement.getAttribute('data-cert-category');
    const typeSlug = actionElement.getAttribute('data-cert-type');
    if (category && typeSlug) {
      const key = `${category}:${typeSlug}`;
      certificateDrafts.delete(key);
      // Reset the file <input> so re-selecting the same filename still fires 'change'.
      const fileInput = document.querySelector<HTMLInputElement>(
        `#cert-${category}-${typeSlug}-file`,
      );
      if (fileInput) {
        fileInput.value = '';
      }
      const path = `/certificates/${category}`;
      if (portalNotice?.path === path) {
        portalNotice = null;
      }
      expandedCertificates.add(key);
      renderApp();
    }
  }

  if (action === 'toggle-menu') {
    const header = actionElement.closest('.site-header');
    const isOpen = header?.classList.toggle('is-open') ?? false;
    actionElement.setAttribute('aria-expanded', String(isOpen));
  }
}

function isAuthMode(value: string | undefined): value is AuthMode {
  return value === 'signin' || value === 'signup' || value === 'verify' || value === 'forgot' || value === 'reset';
}

async function handleResendCode(): Promise<void> {
  const emailInput = document.querySelector<HTMLInputElement>('#auth-verify input[name="email"]');
  const email = (emailInput?.value.trim() || pendingEmail).toLowerCase();

  if (!email) {
    setAuthNotice('Enter your email address before requesting a new code.', 'error');
    return;
  }

  try {
    await resendVerificationCode(email);
    pendingEmail = email;
    setAuthNotice('A new verification code was sent by Cognito.', 'success');
  } catch (error) {
    setAuthNotice(normalizeError(error).message, 'error');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

appRoot.addEventListener('click', handleClick);
appRoot.addEventListener('submit', (event) => {
  void handleSubmit(event);
});
window.addEventListener('hashchange', () => {
  // Drop any per-page notice when the user navigates to a different page.
  if (portalNotice && portalNotice.path !== getCurrentPath()) {
    portalNotice = null;
  }
  renderApp();
});

renderApp();
