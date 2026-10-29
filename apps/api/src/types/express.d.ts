import type { AuthContext } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; present on every protected route. */
      auth?: AuthContext;
    }
  }
}

export {};
