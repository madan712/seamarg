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

type CertificateRecord = {
  certificateId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
  processingStatus: 'ANALYZING' | 'ANALYZED' | 'REVIEW_REQUIRED' | string;
  documentName?: string | null;
  documentCategory?: string | null;
  rank?: string | null;
  expiryDate?: string | null;
  issuer?: string | null;
  certificateNumber?: string | null;
  confidence?: number | null;
  extractionSource?: string | null;
  extractionNotes?: string | null;
};

type DownloadUrlResponse = {
  url: string;
  expiresAt: string;
};

type CertificatesState = {
  items: CertificateRecord[];
  loading: boolean;
  uploading: boolean;
  loadedForSubject: string | null;
  notice: string;
  noticeKind: NoticeKind;
};

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
let pendingEmail = '';
let pendingPasswordForAutoSignIn = '';
let certificatesState: CertificatesState = {
  items: [],
  loading: false,
  uploading: false,
  loadedForSubject: null,
  notice: '',
  noticeKind: 'info',
};

function resetCertificateState(): void {
  certificatesState = {
    items: [],
    loading: false,
    uploading: false,
    loadedForSubject: null,
    notice: '',
    noticeKind: 'info',
  };
}

const publicRoutes: Route[] = [
  { path: '/', label: 'Home', render: renderHome, nav: 'public' },
  { path: '/about', label: 'About', render: renderAbout, nav: 'public' },
  { path: '/help', label: 'Help/FAQ', render: renderHelp, nav: 'public' },
  { path: '/contact', label: 'Contact', render: renderContact, nav: 'public' },
  { path: '/support', label: 'Support', render: renderSupport, nav: 'public' },
  { path: '/signin', label: 'Sign in', render: renderSignIn },
];

const privateRoutes: Route[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    render: () => renderPrivatePage('Dashboard'),
    nav: 'private',
    requiresAuth: true,
  },
  {
    path: '/profile',
    label: 'Profile',
    render: () => renderPrivatePage('Profile'),
    nav: 'private',
    requiresAuth: true,
  },
  {
    path: '/certificates',
    label: 'Certificates',
    render: renderCertificates,
    nav: 'private',
    requiresAuth: true,
  },
  {
    path: '/ai',
    label: 'Ask SeaMarg AI',
    render: () => renderPrivatePage('Ask SeaMarg AI'),
    nav: 'private',
    requiresAuth: true,
  },
  {
    path: '/career',
    label: 'Career Path',
    render: () => renderPrivatePage('Career Path'),
    nav: 'private',
    requiresAuth: true,
  },
  {
    path: '/account',
    label: 'Account',
    render: renderAccount,
    nav: 'private',
    requiresAuth: true,
  },
];

const allRoutes = [...publicRoutes, ...privateRoutes];

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

function signUpWithCognito(email: string, password: string, name: string): Promise<ISignUpResult> {
  const attributes = [
    new CognitoUserAttribute({ Name: 'email', Value: email }),
    ...(name ? [new CognitoUserAttribute({ Name: 'name', Value: name })] : []),
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
  resetCertificateState();
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
  const route = allRoutes.find((candidate) => candidate.path === path) ?? null;

  if (path === '/signin' && session) {
    setPath('/dashboard');
    return;
  }

  if (!route) {
    appRoot.innerHTML = renderLayout(session, renderNotFound());
    return;
  }

  if (route.requiresAuth && !session) {
    appRoot.innerHTML = renderLayout(session, renderAuthRequired(route.label));
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
          <small>Navigate Your Maritime Career</small>
        </span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" data-action="toggle-menu">
        Menu
      </button>
      <nav class="site-nav" aria-label="Primary navigation">
        ${
          isSignedIn
            ? privateRoutes
                .filter((route) => route.nav === 'private')
                .map((route) => navLink(route.path, route.label))
                .join('')
            : publicRoutes
                .filter((route) => route.nav === 'public')
                .map((route) => navLink(route.path, route.label))
                .join('')
        }
      </nav>
      <div class="header-actions">
        ${
          isSignedIn
            ? `<button class="button button-ghost" type="button" data-action="logout">Sign out</button>`
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
        <p class="eyebrow">AI-powered maritime guidance</p>
        <h1>Navigate your maritime career with clarity.</h1>
        <p class="hero-copy">
          SeaMarg helps seafarers understand certificates, DG Shipping and STCW compliance, career next steps, and scam risk before small mistakes become missed contracts.
        </p>
        <div class="hero-actions">
          <button class="button button-primary" type="button" data-action="login">Get started</button>
          <a class="button button-secondary" href="#/help">Explore FAQ</a>
        </div>
        <p class="trust-note">Not a manning agent. Not a certification authority. Guidance is advisory only.</p>
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
            <span>Certificate check</span>
            <span>Career path</span>
            <span>Scam alert</span>
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
        ${featureCard('Scattered advice', 'Government portals, informal groups, and unofficial advice rarely give one practical answer.')}
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
        ${inputField('name', 'Full name', 'text', 'name')}
        ${inputField('email', 'Email', 'email', 'email')}
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

function renderPrivatePage(title: string): string {
  return `
    <section class="private-shell">
      <aside class="private-sidebar">
        <p class="eyebrow">Seafarer portal</p>
        ${privateRoutes
          .filter((route) => route.nav === 'private')
          .map((route) => navLink(route.path, route.label))
          .join('')}
      </aside>
      <section class="private-main">
        <div class="private-title">
          <p class="eyebrow">Private</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="blank-workspace" aria-label="${escapeHtml(title)} workspace"></div>
      </section>
    </section>
  `;
}

function renderCertificates(session: AuthSession | null): string {
  if (!session) {
    return renderAuthRequired('Certificates');
  }

  const subject = claimToString(session.claims.sub) ?? 'signed-in-user';
  const items = certificatesState.loadedForSubject === subject ? certificatesState.items : [];
  const totalCount = items.length;
  const expiringCount = items.filter((item) => getExpiryStatus(item.expiryDate).kind === 'expiring').length;
  const expiredCount = items.filter((item) => getExpiryStatus(item.expiryDate).kind === 'expired').length;
  const reviewCount = items.filter((item) => item.processingStatus === 'REVIEW_REQUIRED').length;

  return `
    <section class="private-shell">
      <aside class="private-sidebar">
        <p class="eyebrow">Seafarer portal</p>
        ${privateRoutes
          .filter((route) => route.nav === 'private')
          .map((route) => navLink(route.path, route.label))
          .join('')}
      </aside>
      <section class="private-main certificate-page" id="certificate-page">
        <div class="private-title certificate-title-row">
          <div class="certificate-title-copy">
            <p class="eyebrow">Private</p>
            <h1>Certificates</h1>
            <p class="certificate-subtitle">Documents, expiry dates, and review status in one workspace.</p>
          </div>
          <button class="button button-ghost" type="button" data-action="refresh-certificates" ${
            certificatesState.loading ? 'disabled' : ''
          }>Refresh</button>
        </div>

        <div class="certificate-stats" aria-label="Certificate summary">
          ${certificateStat('Documents', String(totalCount))}
          ${certificateStat('Expiring soon', String(expiringCount))}
          ${certificateStat('Expired', String(expiredCount))}
          ${certificateStat('Needs review', String(reviewCount))}
        </div>

        <form class="certificate-upload" id="certificate-upload-form">
          <div class="certificate-upload-copy">
            <label id="certificate-file-label" for="certificate-file">Certificate or document</label>
            <span id="certificate-file-hint">PDF, image, text, or Word document</span>
          </div>
          <div class="certificate-upload-control">
            <input
              class="certificate-file-input"
              id="certificate-file"
              name="file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt,.doc,.docx,application/pdf,image/*,text/plain"
              aria-labelledby="certificate-file-label"
              aria-describedby="certificate-file-hint"
              required
            />
            <label class="certificate-file-picker" for="certificate-file">
              <span class="certificate-file-button">Choose file</span>
              <span class="certificate-file-name" data-file-name>No file selected</span>
            </label>
          </div>
          <button class="button button-primary" type="submit" ${certificatesState.uploading ? 'disabled' : ''}>
            ${certificatesState.uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>

        ${renderCertificatesNotice()}

        <div class="certificate-table-wrap">
          ${renderCertificatesTable(items)}
        </div>
      </section>
    </section>
  `;
}

function certificateStat(label: string, value: string): string {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderCertificatesNotice(): string {
  if (!certificatesState.notice) {
    return '';
  }

  const noticeClass =
    certificatesState.noticeKind === 'error'
      ? 'alert-error'
      : certificatesState.noticeKind === 'warning'
        ? 'alert-warning'
        : certificatesState.noticeKind === 'success'
          ? 'alert-success'
          : 'alert-info';

  return `<p class="alert ${noticeClass} certificate-notice" role="status">${escapeHtml(certificatesState.notice)}</p>`;
}

function renderCertificatesTable(items: CertificateRecord[]): string {
  if (certificatesState.loading) {
    return `<div class="certificate-empty"><strong>Loading certificates...</strong></div>`;
  }

  if (items.length === 0) {
    return `
      <div class="certificate-empty">
        <strong>No certificates uploaded yet.</strong>
      </div>
    `;
  }

  return `
    <table class="certificate-table">
      <thead>
        <tr>
          <th>Document</th>
          <th>Rank</th>
          <th>Expiry</th>
          <th>Status</th>
          <th>Uploaded</th>
          <th><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        ${items.map(renderCertificateRow).join('')}
      </tbody>
    </table>
  `;
}

function renderCertificateRow(item: CertificateRecord): string {
  const expiryStatus = getExpiryStatus(item.expiryDate);
  const processingStatus = getProcessingStatus(item.processingStatus);
  const confidence = typeof item.confidence === 'number' ? `${Math.round(item.confidence * 100)}%` : 'Review';

  return `
    <tr>
      <td>
        <strong>${escapeHtml(item.documentName || item.originalFilename)}</strong>
        <span>${escapeHtml(item.documentCategory || item.originalFilename)}</span>
        <small>${escapeHtml(formatFileSize(item.sizeBytes))} &middot; ${escapeHtml(confidence)}</small>
      </td>
      <td>${escapeHtml(item.rank || 'Not detected')}</td>
      <td>
        <span class="status-pill ${expiryStatus.className}">${escapeHtml(expiryStatus.label)}</span>
      </td>
      <td>
        <span class="status-pill ${processingStatus.className}">${escapeHtml(processingStatus.label)}</span>
      </td>
      <td>${escapeHtml(formatDate(item.uploadedAt))}</td>
      <td>
        <button
          class="button button-ghost certificate-action"
          type="button"
          data-action="open-certificate"
          data-certificate-id="${escapeHtml(item.certificateId)}"
        >View</button>
      </td>
    </tr>
  `;
}

function getExpiryStatus(expiryDate: string | null | undefined): {
  kind: 'unknown' | 'valid' | 'expiring' | 'expired';
  label: string;
  className: string;
} {
  if (!expiryDate) {
    return { kind: 'unknown', label: 'Unknown', className: 'status-neutral' };
  }

  const today = startOfToday();
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

  if (Number.isNaN(days)) {
    return { kind: 'unknown', label: 'Unknown', className: 'status-neutral' };
  }

  if (days < 0) {
    return { kind: 'expired', label: 'Expired', className: 'status-danger' };
  }

  if (days <= 90) {
    return { kind: 'expiring', label: `${days} days`, className: 'status-warning' };
  }

  return { kind: 'valid', label: formatDate(expiryDate), className: 'status-good' };
}

function getProcessingStatus(status: string): { label: string; className: string } {
  if (status === 'ANALYZED') {
    return { label: 'Analyzed', className: 'status-good' };
  }
  if (status === 'ANALYZING') {
    return { label: 'Analyzing', className: 'status-neutral' };
  }
  if (status === 'REVIEW_REQUIRED') {
    return { label: 'Review', className: 'status-warning' };
  }
  return { label: status || 'Unknown', className: 'status-neutral' };
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAccount(session: AuthSession | null): string {
  if (!session) {
    return renderAuthRequired('Account');
  }

  const email = claimToString(session.claims.email) ?? 'Signed-in user';
  const subject = claimToString(session.claims.sub) ?? 'Unavailable';

  return `
    <section class="private-shell">
      <aside class="private-sidebar">
        <p class="eyebrow">Seafarer portal</p>
        ${privateRoutes
          .filter((route) => route.nav === 'private')
          .map((route) => navLink(route.path, route.label))
          .join('')}
      </aside>
      <section class="private-main">
        <div class="private-title">
          <p class="eyebrow">Private</p>
          <h1>Account</h1>
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
          <button class="button button-ghost" type="button" data-action="logout">Sign out</button>
        </div>
      </section>
    </section>
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

  const certificatePage = document.querySelector<HTMLElement>('#certificate-page');

  if (certificatePage && session) {
    const fileInput = certificatePage.querySelector<HTMLInputElement>('#certificate-file');
    const fileName = certificatePage.querySelector<HTMLElement>('[data-file-name]');

    if (fileInput && fileName) {
      fileInput.addEventListener('change', () => {
        const selectedFile = fileInput.files?.[0];
        fileName.textContent = selectedFile?.name ?? 'No file selected';
        fileName.title = selectedFile?.name ?? '';
      });
    }

    void loadCertificates(session);
  }
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === 'certificate-upload-form') {
    event.preventDefault();
    await handleCertificateUpload(form);
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

async function loadCertificates(session: AuthSession, force = false): Promise<void> {
  const subject = claimToString(session.claims.sub) ?? 'signed-in-user';

  if (!force && certificatesState.loadedForSubject === subject) {
    return;
  }

  certificatesState = {
    ...certificatesState,
    loading: true,
    loadedForSubject: subject,
    notice: force ? 'Refreshing certificates...' : certificatesState.notice,
    noticeKind: 'info',
  };
  renderApp();

  try {
    const items = await apiRequest<CertificateRecord[]>('/api/customer/certificates', session);
    certificatesState = {
      ...certificatesState,
      items,
      loading: false,
      loadedForSubject: subject,
      notice: items.length ? '' : 'No certificate records yet.',
      noticeKind: 'info',
    };
  } catch (error) {
    certificatesState = {
      ...certificatesState,
      loading: false,
      notice: normalizeError(error).message,
      noticeKind: 'error',
    };
  }

  renderApp();
}

async function handleCertificateUpload(form: HTMLFormElement): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  if (!form.reportValidity()) {
    return;
  }

  const fileInput = form.elements.namedItem('file');
  const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;

  if (!file) {
    certificatesState = {
      ...certificatesState,
      notice: 'Choose a certificate file to upload.',
      noticeKind: 'error',
    };
    renderApp();
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  certificatesState = {
    ...certificatesState,
    uploading: true,
    notice: 'Uploading certificate...',
    noticeKind: 'info',
  };
  renderApp();

  try {
    const uploaded = await apiRequest<CertificateRecord>('/api/customer/certificates', session, {
      method: 'POST',
      body: formData,
    });
    certificatesState = {
      ...certificatesState,
      uploading: false,
      notice: `${uploaded.documentName || uploaded.originalFilename} uploaded.`,
      noticeKind: uploaded.processingStatus === 'REVIEW_REQUIRED' ? 'warning' : 'success',
    };
    await loadCertificates(session, true);
  } catch (error) {
    certificatesState = {
      ...certificatesState,
      uploading: false,
      notice: normalizeError(error).message,
      noticeKind: 'error',
    };
    renderApp();
  }
}

async function openCertificate(certificateId: string): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  try {
    certificatesState = {
      ...certificatesState,
      notice: 'Preparing document link...',
      noticeKind: 'info',
    };
    renderApp();
    const response = await apiRequest<DownloadUrlResponse>(
      `/api/customer/certificates/${encodeURIComponent(certificateId)}/download-url`,
      session,
    );
    certificatesState = { ...certificatesState, notice: '', noticeKind: 'info' };
    renderApp();
    window.open(response.url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    certificatesState = {
      ...certificatesState,
      notice: normalizeError(error).message,
      noticeKind: 'error',
    };
    renderApp();
  }
}

async function refreshCertificates(): Promise<void> {
  const session = getSession();

  if (!session) {
    startLogin();
    return;
  }

  await loadCertificates(session, true);
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
    resetCertificateState();
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
      replaceLocation('/dashboard');
      renderApp();
      return;
    }

    if (form.id === 'auth-signup') {
      if (password !== confirmPassword) {
        setAuthNotice('Passwords do not match.', 'error');
        return;
      }

      const result = await signUpWithCognito(email, password, getFormValue(form, 'name'));
      pendingEmail = email;
      pendingPasswordForAutoSignIn = password;

      if (result.userConfirmed) {
        const session = await signInWithCognito(email, password);
        saveSession(session);
        replaceLocation('/dashboard');
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
        replaceLocation('/dashboard');
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

  if (!action) {
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

  if (action === 'refresh-certificates') {
    void refreshCertificates();
  }

  if (action === 'open-certificate') {
    const certificateId = actionElement.dataset.certificateId;

    if (certificateId) {
      void openCertificate(certificateId);
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
window.addEventListener('hashchange', renderApp);

renderApp();
