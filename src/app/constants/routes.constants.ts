/**
 * Centralized route constants for the application
 * This prevents hard-coded paths and makes route changes easier to maintain
 */

// Base route segments
export const ROUTES = {
  // Core routes
  HOME: '',
  AUTH: 'auth',
  HELP: 'help',
  SPLIT: 'split',
  ABOUT: 'about',
  DEMO: 'demo',

  // Feature modules
  ADMINISTRATION: 'administration',
  EXPENSES: 'expenses',
  MEMORIZED: 'memorized',
  ANALYSIS: 'analysis',

  // Auth sub-routes
  LOGIN: 'login',
  REGISTER: 'register',
  FORGOT_PASSWORD: 'forgot-password',
  RESET_PASSWORD: 'reset-password',
  ACCOUNT: 'account',

  // Administration sub-routes
  GROUPS: 'groups',
  MEMBERS: 'members',
  CATEGORIES: 'categories',

  // Analysis sub-routes
  SUMMARY: 'summary',
  HISTORY: 'history',

  // Expenses sub-routes
  ADD: 'add',
} as const;

// Full path builders for complex routes
export const ROUTE_PATHS = {
  // Auth routes
  AUTH_LOGIN: `/${ROUTES.AUTH}/${ROUTES.LOGIN}`,
  AUTH_REGISTER: `/${ROUTES.AUTH}/${ROUTES.REGISTER}`,
  AUTH_ACCOUNT: `/${ROUTES.AUTH}/${ROUTES.ACCOUNT}`,
  AUTH_FORGOT_PASSWORD: `/${ROUTES.AUTH}/${ROUTES.FORGOT_PASSWORD}`,
  AUTH_RESET_PASSWORD: `/${ROUTES.AUTH}/${ROUTES.RESET_PASSWORD}`,
  
  // Administration routes
  ADMIN_GROUPS: `/${ROUTES.ADMINISTRATION}/${ROUTES.GROUPS}`,
  ADMIN_MEMBERS: `/${ROUTES.ADMINISTRATION}/${ROUTES.MEMBERS}`,
  ADMIN_CATEGORIES: `/${ROUTES.ADMINISTRATION}/${ROUTES.CATEGORIES}`,
  
  // Analysis routes
  ANALYSIS_SUMMARY: `/${ROUTES.ANALYSIS}/${ROUTES.SUMMARY}`,
  ANALYSIS_HISTORY: `/${ROUTES.ANALYSIS}/${ROUTES.HISTORY}`,
  
  // Expenses routes
  EXPENSES_ROOT: `/${ROUTES.EXPENSES}`,
  EXPENSES_ADD: `/${ROUTES.EXPENSES}/${ROUTES.ADD}`,
  
  // Memorized routes
  MEMORIZED_ROOT: `/${ROUTES.MEMORIZED}`,
  MEMORIZED_ADD: `/${ROUTES.MEMORIZED}/${ROUTES.ADD}`,
  
  // Other routes
  SPLIT: `/${ROUTES.SPLIT}`,
  HELP: `/${ROUTES.HELP}`,
  ABOUT: `/${ROUTES.ABOUT}`,
  HOME: `/${ROUTES.HOME}`,
} as const;

// Demo routes (mirroring the main routes structure)
export const DEMO_ROUTE_PATHS = {
  // Demo administration routes
  DEMO_GROUPS: `/${ROUTES.DEMO}/${ROUTES.ADMINISTRATION}/${ROUTES.GROUPS}`,
  DEMO_MEMBERS: `/${ROUTES.DEMO}/${ROUTES.ADMINISTRATION}/${ROUTES.MEMBERS}`,
  DEMO_CATEGORIES: `/${ROUTES.DEMO}/${ROUTES.ADMINISTRATION}/${ROUTES.CATEGORIES}`,

  // Demo analysis routes
  DEMO_SUMMARY: `/${ROUTES.DEMO}/${ROUTES.ANALYSIS}/${ROUTES.SUMMARY}`,
  DEMO_HISTORY: `/${ROUTES.DEMO}/${ROUTES.ANALYSIS}/${ROUTES.HISTORY}`,

  // Demo expenses routes
  DEMO_EXPENSES: `/${ROUTES.DEMO}/${ROUTES.EXPENSES}`,

  // Demo memorized routes
  DEMO_MEMORIZED: `/${ROUTES.DEMO}/${ROUTES.MEMORIZED}`,

  // Demo other routes
  DEMO_SPLIT: `/${ROUTES.DEMO}/${ROUTES.SPLIT}`,
  DEMO_HELP: `/${ROUTES.DEMO}/${ROUTES.HELP}`,
} as const;

// Helper functions for dynamic routes
export const buildExpenseEditPath = (id: string) => `/${ROUTES.EXPENSES}/${id}`;
export const buildMemorizedEditPath = (id: string) => `/${ROUTES.MEMORIZED}/${id}`;
export const buildMemberEditPath = (id: string) => `/${ROUTES.ADMINISTRATION}/${ROUTES.MEMBERS}/${id}`;
export const buildCategoryEditPath = (id: string) => `/${ROUTES.ADMINISTRATION}/${ROUTES.CATEGORIES}/${id}`;

// Helper functions for demo routes
export const buildDemoExpenseEditPath = (id: string) => `/${ROUTES.DEMO}/${ROUTES.EXPENSES}/${id}`;
export const buildDemoMemorizedEditPath = (id: string) => `/${ROUTES.DEMO}/${ROUTES.MEMORIZED}/${id}`;
export const buildDemoMemberEditPath = (id: string) => `/${ROUTES.DEMO}/${ROUTES.ADMINISTRATION}/${ROUTES.MEMBERS}/${id}`;
export const buildDemoCategoryEditPath = (id: string) => `/${ROUTES.DEMO}/${ROUTES.ADMINISTRATION}/${ROUTES.CATEGORIES}/${id}`;