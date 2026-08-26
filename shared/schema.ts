import { z } from "zod";

// ===== WATI Broadcast types =====

export const watiContactSchema = z.object({
  name: z.string(),
  countryCode: z.string(),
  phone: z.string(),
  allowCampaign: z.boolean().default(true),
  allowSMS: z.boolean().default(true),
  email: z.string().optional(),
  intake: z.string().optional(),
});

export type WatiContact = z.infer<typeof watiContactSchema>;

export const broadcastTypeSchema = z.enum([
  "welcome",
  "no_show_up",
]);
export type BroadcastType = z.infer<typeof broadcastTypeSchema>;

export const sendBroadcastSchema = z.object({
  broadcastType: broadcastTypeSchema,
  templateName: z.string(),
  broadcastName: z.string(),
  contacts: z.array(watiContactSchema).min(1),
  mediaUrl: z.string().url().optional(),
});

export type SendBroadcastRequest = z.infer<typeof sendBroadcastSchema>;

// ===== Report data types =====

export type CountryGroup =
  | "SG"
  | "MY"
  | "OTHERS"
  | "INVALID";

export interface VWDateEntry {
  label: string; // e.g. "May"
  pastSignups: number; // prior cumulative sign-ups from that VW date
}

export interface SessionDetails {
  sessionDate: string; // "DD/MM/YY" or "DDMMYY"
  attendanceAtPitch: number | null;
  programPrice: number; // default 297 (SGD) for ATS Zoom
  speaker: string; // session's speaker/mentor (editable)
  vwDates: VWDateEntry[]; // repeatable date+count rows (e.g. May/June past sign-ups)
}

export interface PreviewMetrics {
  optInCount: number;
  optInWithoutInvalidCount: number;
  showUpCount: number;
  showUpPct: number; // % of opt-in
  attendanceAtPitch: number; // NET attendance after subtracting old students (entered - oldStudentsShowUpCount)
  attendanceAtPitchEntered: number; // RAW value entered by user (before old-student exclusion)
  attendanceAtPitchPct: number; // % of show-up, based on NET attendance
  signUpCount: number; // TC + BT (deduped by email)
  signUpPct: number; // % of attendance at pitch
  revenueTotal: number; // programPrice * signUpCount
  signUpsByIntakeForVW: Record<string, number>; // per-VW-date total = pastSignups + matching intake sign-ups
  oldStudentsExcludedCount: number; // # of Old ATS Students filtered out of Opt-In + Show Up
  oldStudentsShowUpOptInCount: number; // # of Old Students who both showed up and were in Opt-In (pre-exclusion)
  oldStudentsShowUpCount: number; // # of Old Students who appeared in Show Up — subtracted from Attendance at Pitch
  showUpAddedToOptInCount: number; // always 0 — this app has no Keap source to fall back from
}

export interface OptInRow {
  firstName: string;
  fullName: string; // first name only (matches reference)
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  showedUp: boolean;
  signedUp: boolean;
}

/** Show up Merge row — a row per attendee from the Everwebinar export. */
export interface ShowUpMergeRow {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  durationMinutes: number;
  source: "Everwebinar";
  signedUp: boolean;
  signedUpEmail: string; // for the "Sign up" column display
}

/** Show up REG row — a row per Zoom registrant with a Showed Up flag. */
export interface ShowUpRegRow {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  showedUp: boolean;
  signedUp: boolean;
}

export interface SignUpRow {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
  country: CountryGroup;
  source: "ThriveCart" | "BT" | "ThriveCart+BT";
  // Actual payment gateway/processor read from the ThriveCart CSV (e.g.
  // "Stripe", "PayPal"), when that column is present. Empty if not found.
  paymentMethod: string;
  pricingOption: string;
  intake: string; // "May", "June", or "" — derived from pricingOption / orderDate
  total: number;
  orderDate: string;
  showedUp: boolean;
  inOptIn: boolean;
}

export interface StudentListRow {
  packageSold: string;
  name: string;
  email: string;
  mobile: string;
  mobileCountryCode: string; // "SG", "MY", etc. (label not digits)
  expirationDate: string; // e.g. "7-May-2027"
  monthsToExpire: number;
  previewDate: string; // e.g. "7-May-2026"
  speaker: string; // "LIVE Zoom-<Speaker>"
  affiliateId: string; // "-"
  enrolmentDate: string; // same as preview date
  currency: string; // "SGD"
  courseFeeWGst: string; // "3997.00"
  amountPaid: string;
  paymentGateway: string; // "stripe" or "Bank Transfer"
}

/** Row in the Old Students tab — one per old student matched in this session. */
export interface OldStudentExclusionRow {
  email: string;
  name: string;
  country: CountryGroup | "";
  foundIn: "Opt-In" | "Show Up" | "Opt-In + Show Up";
}

export interface CountryBreakdown {
  SG: number;
  MY: number;
  OTHERS: number;
  INVALID: number;
}

export interface ReportData {
  sessionDetails: SessionDetails;
  metrics: PreviewMetrics;
  optInByCountry: CountryBreakdown;
  showUpByCountry: CountryBreakdown;
  signUpByCountry: CountryBreakdown;
  optIns: OptInRow[];
  showUpMerge: ShowUpMergeRow[];
  showUpReg: ShowUpRegRow[];
  signUps: SignUpRow[];
  studentList: StudentListRow[];
  oldStudentsExcluded: OldStudentExclusionRow[];
  // Old students who showed up, kept separately (with full contact info) so
  // the Keap Working export can still tag them with the show-up tag — even
  // though they remain excluded from the Opt-In / Show Up report tabs.
  oldStudentsShowUpRows: ShowUpMergeRow[];
  generatedAt: string;
  // Tag 4 List exclusion (ATS4) — contacts in the uploaded Tag 4 CSV are
  // filtered out of the No Show Up broadcast. Match by normalized phone
  // (primary) with email fallback. Empty when no Tag 4 CSV was uploaded.
  nlow4ExcludedPhones?: string[];
  nlow4ExcludedEmails?: string[];
}
