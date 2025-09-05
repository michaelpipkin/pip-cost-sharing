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
  HOME: `/${ROUTES.HOME}`,
} as const;

// Helper functions for dynamic routes
export const buildExpenseEditPath = (id: string) => `/${ROUTES.EXPENSES}/${id}`;
export const buildMemorizedEditPath = (id: string) => `/${ROUTES.MEMORIZED}/${id}`;
export const buildMemberEditPath = (id: string) => `/${ROUTES.ADMINISTRATION}/${ROUTES.MEMBERS}/${id}`;
export const buildCategoryEditPath = (id: string) => `/${ROUTES.ADMINISTRATION}/${ROUTES.CATEGORIES}/${id}`;