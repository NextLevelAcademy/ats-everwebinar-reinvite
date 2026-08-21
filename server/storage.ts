// In-memory only — no database needed for this app.
// All data lives in the browser; backend only proxies WATI API calls.
export interface IStorage {}
export const storage: IStorage = {};
