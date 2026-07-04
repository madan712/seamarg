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
let pendingEmail = '';
let pendingPasswordForAutoSignIn = '';

// Portal per-page notice (e.g. "Saved."), scoped to the page that set it.
let portalNotice: { path: string; message: string; kind: NoticeKind } | null = null;

const publicRoutes: Route[] = [
  { path: '/', label: 'Home', render: renderHome, nav: 'public' },
  { path: '/about', label: 'About', render: renderAbout, nav: 'public' },
  { path: '/help', label: 'Help/FAQ', render: renderHelp, nav: 'public' },
  { path: '/contact', label: 'Contact', render: renderContact, nav: 'public' },
  { path: '/support', label: 'Support', render: renderSupport, nav: 'public' },
  { path: '/signin', label: 'Sign in', render: renderSignIn },
];

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
    ],
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

// Load all profile sections for the signed-in user from the backend once per
// session (per Cognito subject). Errors are surfaced but do not block editing.
async function loadProfileFromApi(session: AuthSession, force = false): Promise<void> {
  const subject = claimToString(session.claims.sub) ?? 'anonymous';

  if (!force && profileState.loadedForSubject === subject && !profileState.error) {
    return;
  }

  profileState = { ...profileState, loading: true, error: '' };
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

const faqItems = [
  {
    category: 'Account',
    question: 'What is SeaMarg?',
    answer:
      'SeaMarg is an AI-powered career, compliance, and opportunity platform for seafarers. It helps users understand next steps around certificates, career planning, safety, and maritime readiness.',
  },
  {
    category: 'Trust',
    question: 'Is SeaMarg a manning agent?',
    answer:
      'No. SeaMarg is not a manning agent, does not offer jobs directly, and does not collect money for job placement.',
  },
  {
    category: 'Compliance',
    question: 'Can SeaMarg guarantee that I can join a vessel?',
    answer:
      'No. SeaMarg provides advisory guidance only. Final acceptance depends on company policy, flag-state requirements, DG Shipping, MMD, and document verification.',
  },
  {
    category: 'DG Shipping',
    question: 'Does SeaMarg replace DG Shipping or MMD advice?',
    answer:
      'No. SeaMarg helps explain common DG Shipping and maritime compliance topics in practical language, but official decisions remain with the relevant authorities.',
  },
  {
    category: 'AI',
    question: 'What is rule confidence scoring?',
    answer:
      'Rule confidence scoring shows how reliable an AI answer is likely to be based on rule stability, company or flag variation, user data completeness, and circular change risk.',
  },
  {
    category: 'Scam safety',
    question: 'What should I do if an agent asks for money?',
    answer:
      'Treat upfront payment requests as a serious scam warning sign. Do not pay for jobs, verify the company, keep written evidence, and report suspicious activity through support.',
  },
  {
    category: 'Access',
    question: 'Can I use SeaMarg on WhatsApp?',
    answer:
      'WhatsApp-first access is part of the product direction. The first web release focuses on public pages and Cognito login.',
  },
];

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

function renderApp(): void {
  const session = getSession();
  const path = getCurrentPath();

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
      <a class="brand" href="#/" aria-label="SeaMarg home">
        <span class="brand-mark">SM</span>
        <span>
          <strong>SeaMarg</strong>
          <small>One crew. Every shore.</small>
        </span>
      </a>
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
        <a href="#/about">About</a>
        <a href="#/help">Help/FAQ</a>
        <a href="#/support">Support</a>
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

function renderHome(): string {
  return `
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">Crew document command center</p>
        <h1>One crew. Every shore.</h1>
        <p class="hero-copy">
          SeaMarg keeps certificates, compliance signals, career next steps, and scam-risk guidance in one practical workspace before small mistakes become missed contracts.
        </p>
        <div class="hero-actions">
          <button class="button button-primary" type="button" data-action="login">Get started</button>
          <a class="button button-secondary" href="#/help">Explore FAQ</a>
        </div>
        <p class="trust-note">Not a manning agent. Not a certification authority. Guidance is advisory only.</p>
        <div class="hero-stats" aria-label="SeaMarg highlights">
          <span><strong>82</strong><small>Readiness score</small></span>
          <span><strong>90d</strong><small>Expiry watch</small></span>
          <span><strong>AI</strong><small>Rule confidence</small></span>
        </div>
      </div>
      <div class="hero-visual" aria-label="SeaMarg dashboard preview">
        <div class="mock-browser">
          <div class="mock-browser-bar">
            <span></span><span></span><span></span>
          </div>
          <div class="readiness-panel">
            <p class="panel-kicker">Joining readiness</p>
            <div class="score-ring">
              <span>82</span>
              <small>Medium</small>
            </div>
            <ul>
              <li><strong>COC:</strong> review before sign-on</li>
              <li><strong>Medical:</strong> valid for now</li>
              <li><strong>Next:</strong> confirm company policy</li>
            </ul>
          </div>
          <div class="mini-grid">
            <span>Document wallet</span>
            <span>Expiry alerts</span>
            <span>Scam signals</span>
            <span>DG guidance</span>
          </div>
        </div>
      </div>
    </section>

    <section class="section-band">
      <div class="section-heading">
        <p class="eyebrow">The problem</p>
        <h2>Seafarers face a serious information gap.</h2>
      </div>
      <div class="feature-grid">
        ${featureCard('Complex rules', 'DG Shipping, STCW, flag-state, company, and MMD requirements can overlap and change.')}
        ${featureCard('Scattered proof', 'Certificates, medicals, training evidence, and company requirements are rarely kept in one readable place.')}
        ${featureCard('Real career cost', 'Last-minute document issues can mean delayed sign-on, missed contracts, and unnecessary agent dependence.')}
      </div>
    </section>

    <section class="split-section">
      <div>
        <p class="eyebrow">The SeaMarg approach</p>
        <h2>A practical digital guide for seafarers.</h2>
        <p>
          SeaMarg is designed to understand a seafarer profile, explain eligibility in plain language, surface risk before sign-on, and show clear next steps.
        </p>
      </div>
      <div class="check-list">
        <p>Certificate and compliance checks</p>
        <p>Career and promotion roadmap</p>
        <p>Rule confidence scoring</p>
        <p>Scam and agent risk alerts</p>
        <p>WhatsApp-first product direction</p>
      </div>
    </section>
  `;
}

function renderAbout(): string {
  return `
    <section class="page-hero">
      <p class="eyebrow">About SeaMarg</p>
      <h1>The path for seafarers.</h1>
      <p>
        Sea means maritime. Marg means path, guidance, and direction. SeaMarg brings those ideas together as a trusted digital guide for seafarers.
      </p>
    </section>
    <section class="section-band">
      <div class="mission-layout">
        <div>
          <h2>From confusion to clarity.</h2>
          <p>
            SeaMarg exists to help seafarers understand what to do next across compliance, career readiness, certificates, training, and safer opportunities.
          </p>
        </div>
        <div class="pillar-list">
          ${pillar('Guidance', 'Profile-aware answers and practical next steps.')}
          ${pillar('Compliance', 'Certificate, DG Shipping, STCW, and readiness awareness.')}
          ${pillar('Opportunities', 'A future path toward verified jobs and trusted maritime partners.')}
          ${pillar('Trust', 'Clear disclaimers, scam awareness, and advisory boundaries.')}
        </div>
      </div>
    </section>
  `;
}

function renderHelp(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Help/FAQ</p>
      <h1>Clear answers for common SeaMarg questions.</h1>
      <div class="search-wrap">
        <label class="sr-only" for="faq-search">Search FAQ</label>
        <input id="faq-search" type="search" placeholder="Search account, DG Shipping, safety..." autocomplete="off" />
      </div>
    </section>
    <section class="faq-list" id="faq-list">
      ${faqItems.map(renderFaqItem).join('')}
    </section>
  `;
}

function renderContact(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Contact</p>
      <h1>Talk to SeaMarg.</h1>
      <p>Use this page for partnerships, business questions, and general product enquiries.</p>
    </section>
    ${renderForm('contact-form', [
      inputField('name', 'Name', 'text'),
      inputField('email', 'Email', 'email'),
      selectField('role', 'Role', ['Seafarer', 'Company', 'Training institute', 'Advisor', 'Other']),
      inputField('topic', 'Topic', 'text'),
      textAreaField('message', 'Message'),
    ])}
  `;
}

function renderSupport(): string {
  return `
    <section class="page-hero compact">
      <p class="eyebrow">Support</p>
      <h1>Get help with account, compliance, or safety concerns.</h1>
      <p>For agent or scam concerns, include only details you are comfortable sharing until a secure evidence upload flow is available.</p>
    </section>
    ${renderForm('support-form', [
      inputField('name', 'Name', 'text'),
      inputField('email', 'Email or mobile', 'text'),
      selectField('category', 'Category', [
        'Account',
        'Certificate or compliance',
        'AI answer concern',
        'Scam or agent report',
        'Job or company concern',
        'Other',
      ]),
      selectField('priority', 'Priority', ['Normal', 'High', 'Urgent']),
      inputField('subject', 'Subject', 'text'),
      textAreaField('description', 'Description'),
    ])}
  `;
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
  if (step.path === '/profile' && sub.slug === 'main-information') {
    return renderMainInformationForm(session);
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
): string {
  const opts = [`<option value="">Select</option>`]
    .concat(
      options.map(
        (option) =>
          `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`,
      ),
    )
    .join('');
  return `<select id="${id}" name="${escapeHtml(name)}"${required ? ' required' : ''}>${opts}</select>`;
}

function portalCheckboxControl(id: string, name: string, checked: boolean): string {
  return `<input id="${id}" name="${escapeHtml(name)}" type="checkbox"${checked ? ' checked' : ''} />`;
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
    ? `<p class="alert alert-error portal-alert" role="status">${escapeHtml(profileState.error)}</p>`
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

function featureCard(title: string, body: string): string {
  return `
    <article class="feature-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function pillar(title: string, body: string): string {
  return `
    <article>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function renderFaqItem(item: (typeof faqItems)[number]): string {
  return `
    <article class="faq-item" data-faq-item data-search="${escapeHtml(
      `${item.category} ${item.question} ${item.answer}`.toLowerCase(),
    )}">
      <p>${escapeHtml(item.category)}</p>
      <h2>${escapeHtml(item.question)}</h2>
      <p>${escapeHtml(item.answer)}</p>
    </article>
  `;
}

function renderForm(formId: string, fields: string[]): string {
  return `
    <section class="form-section">
      <form class="form-card" id="${formId}">
        ${fields.join('')}
        <div class="form-actions">
          <button class="button button-primary" type="submit">Prepare request</button>
          <p class="form-message" role="status" aria-live="polite"></p>
        </div>
      </form>
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
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === 'profile-main-information-form') {
    event.preventDefault();
    await handleMainInformationSave(form);
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
