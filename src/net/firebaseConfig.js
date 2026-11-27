// Firebase web config from .env.local (kept separate so the Firebase SDK only loads for online play).
const env = import.meta.env || {};
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const useEmulators = env.VITE_FIREBASE_EMULATORS === 'true';
export const firebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.databaseURL) || useEmulators;
