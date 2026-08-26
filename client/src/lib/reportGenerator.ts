import type {
  CountryBreakdown,
  CountryGroup,
  OptInRow,
  OldStudentExclusionRow,
  PreviewMetrics,
  ReportData,
  SessionDetails,
  ShowUpMergeRow,
  ShowUpRegRow,
  SignUpRow,
  StudentListRow,
} from "../../../shared/schema";
import { parseCsv, parseCsvAutoHeader, getVal } from "./csvParse";
import * as XLSX from "xlsx";

// ============ Helpers ============

function digits(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/**
 * Parse a combined phone string (ThriveCart / Bank Transfer rows only —
 * these still arrive as a single field, unlike the Everwebinar export which
 * splits country code and local number into their own columns) like:
 *   `'+65 87661449   `   → cc=65, phone=87661449
 *   `'+65 8915 9826   `  → cc=65, phone=89159826
 *   `81273350   `        → cc="", phone=81273350
 *   `60122974700   `     → cc="60", phone=22974700  (if starts with 60 and >=10 digits)
 *   `'+656594831160   `  → cc="65", phone=6594831160 (no space; cc inferred from prefix)
 */
function parseApostrophePhone(raw: string): { cc: string; local: string } {
  if (!raw) return { cc: "", local: "" };
  // Strip leading apostrophe (Excel text marker) and trailing whitespace/notes.
  let s = raw.replace(/^'+/, "").trim();
  // Remove trailing "(Work)" or similar annotations
  s = s.replace(/\s*\(.*\)\s*$/, "").trim();

  if (s.startsWith("+")) {
    // Format: "+65 87661449" or "+656594831160" (no space)
    const afterPlus = s.slice(1).trim();
    const firstSpace = afterPlus.indexOf(" ");
    if (firstSpace > 0) {
      const cc = digits(afterPlus.slice(0, firstSpace));
      const local = digits(afterPlus.slice(firstSpace + 1));
      return { cc, local };
    }
    // No space — try to split a known country code prefix
    const d = digits(afterPlus);
    if (d.startsWith("65") && d.length >= 10) return { cc: "65", local: d.slice(2) };
    if (d.startsWith("60") && d.length >= 11) return { cc: "60", local: d.slice(2) };
    if (d.startsWith("852") && d.length >= 11) return { cc: "852", local: d.slice(3) };
    if (d.startsWith("1") && d.length >= 11) return { cc: "1", local: d.slice(1) };
    // Fallback: treat as 1- or 2-digit cc (best-effort)
    if (d.length >= 10) return { cc: d.slice(0, 2), local: d.slice(2) };
    return { cc: "", local: d };
  }
  // No leading +: could be a raw 8-digit SG local, or country-code-included intl
  const d = digits(s);
  if (!d) return { cc: "", local: "" };
  // 8-digit SG local (starts with 6,8,9)
  if (d.length === 8 && /^[689]/.test(d)) return { cc: "65", local: d };
  // Starts with 65, length 10 → SG
  if (d.startsWith("65") && d.length === 10) return { cc: "65", local: d.slice(2) };
  // Starts with 60, length 11-12 → MY
  if (d.startsWith("60") && (d.length === 11 || d.length === 12))
    return { cc: "60", local: d.slice(2) };
  // Starts with 1, length 11 → USA
  if (d.startsWith("1") && d.length === 11) return { cc: "1", local: d.slice(1) };
  // Starts with 852, length 11 → HK
  if (d.startsWith("852") && d.length === 11) return { cc: "852", local: d.slice(3) };
  // Fallback: keep as local, no cc
  return { cc: "", local: d };
}

function buildFullPhone(cc: string, local: string): string {
  if (!cc && !local) return "";
  if (!cc) return local;
  if (!local) return cc;
  return cc + local;
}

function detectCountryFromCc(cc: string): CountryGroup {
  const c = digits(cc);
  if (c === "65") return "SG";
  if (c === "60") return "MY";
  // Any other recognizable country code (USA, HK, etc.) → OTHERS
  return "OTHERS";
}

/**
 * Detect country for a row that has only a raw phone (no cc field).
 * No resolvable country code at all (whether or not a local number was
 * entered) → INVALID.
 */
function detectCountry(cc: string, local: string): CountryGroup {
  const c = digits(cc);
  if (!c) return "INVALID";
  return detectCountryFromCc(c);
}

/** Convert an "H:MM:SS" (or "M:SS") duration string to whole minutes. */
function parseHmsToMinutes(s: string): number {
  if (!s) return 0;
  const parts = s.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return Math.round(h * 60 + m + sec / 60);
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return Math.round(m + sec / 60);
  }
  return 0;
}

// ============ Parsers ============

/**
 * One row per Everwebinar registrant. Everwebinar exports opt-in
 * (registration) and show-up (live attendance) as a single unified file —
 * unlike the old Zoom-based flow, there is no separate registration file or
 * participants/attendance file to cross-reference.
 */
interface EwRow {
  first: string;
  last: string;
  fullName: string;
  email: string;
  cc: string;
  local: string;
  fullPhone: string;
  country: CountryGroup;
  attendedLive: boolean;
  durationMinutes: number;
}

function parseEverwebinarRows(rows: Record<string, any>[]): EwRow[] {
  return rows
    .map((r) => {
      const first = getVal(r, ["First name", "First Name", "FirstName"]);
      const last = getVal(r, ["Last name", "Last Name", "LastName"]);
      const email = getVal(r, ["Email", "Email Address"]).toLowerCase();
      const cc = digits(getVal(r, ["Phone country code", "Country code"]));
      const local = digits(getVal(r, ["Phone number", "Phone"]));
      const country = detectCountry(cc, local);
      const attendedRaw = getVal(r, ["Attended live", "Attended Live"]).toLowerCase();
      const durationRaw = getVal(r, [
        "Time in live room",
        "Time In Live Room",
      ]);
      return {
        first,
        last,
        fullName: `${first} ${last}`.trim() || email,
        email,
        cc,
        local,
        fullPhone: buildFullPhone(cc, local),
        country,
        attendedLive: attendedRaw === "yes",
        durationMinutes: parseHmsToMinutes(durationRaw),
      };
    })
    .filter((r) => r.email);
}

/**
 * Keap CRM export (First Name, Phone 1, Email). Used both as the Opt-In
 * source (the main Keap Opt-In CSV) and for the Tag 4 List (ATS4, used only
 * to exclude contacts from the No Show Up broadcast) — same column format,
 * so both files share this parser.
 */
interface KeapRow {
  first: string;
  email: string;
  cc: string;
  local: string;
  fullPhone: string;
  country: CountryGroup;
}

function parseKeapRows(rows: Record<string, any>[]): KeapRow[] {
  return rows
    .map((r) => {
      const first = getVal(r, ["First Name", "FirstName"]);
      const phoneRaw = getVal(r, ["Phone 1", "Phone", "Mobile"]);
      const email = getVal(r, ["Email", "Email Address"]).toLowerCase();
      const { cc, local } = parseApostrophePhone(phoneRaw);
      const country = detectCountry(cc, local);
      return {
        first,
        email,
        cc,
        local,
        fullPhone: buildFullPhone(cc, local),
        country,
      };
    })
    .filter((r) => r.email);
}

interface TCRow {
  first: string;
  last: string;
  email: string;
  phone: string;
  total: number;
  pricingOption: string;
  packageName: string;
  orderDate: string;
  // Actual payment gateway/processor (e.g. "Stripe", "PayPal"), if the
  // ThriveCart export includes such a column. Empty string if not found.
  paymentMethod: string;
}

function parseTCRows(rows: Record<string, any>[]): TCRow[] {
  return rows
    .map((r) => {
      const totalStr = getVal(r, ["total", "Total", "amount"]);
      const total = parseFloat(totalStr.replace(/[^0-9.\-]/g, "")) || 0;
      return {
        first: getVal(r, [
          "customer_first_name",
          "first_name",
          "Customer First Name",
          "First Name",
        ]),
        last: getVal(r, [
          "customer_last_name",
          "last_name",
          "Customer Last Name",
          "Last Name",
        ]),
        email: getVal(r, [
          "customer_email",
          "email",
          "Customer Email",
          "Email",
        ]).toLowerCase(),
        phone: getVal(r, [
          "customer_phone",
          "phone",
          "Phone",
          "telephone",
          "Telephone",
          "customer_telephone",
        ]),
        total,
        pricingOption: getVal(r, [
          "relevant_item_pricing_option",
          "pricing_option",
          "Pricing Option",
        ]),
        packageName: getVal(r, [
          "relevant_item_name",
          "Product",
          "Item Name",
        ]),
        orderDate: getVal(r, ["order_date", "Order Date", "date"]),
        paymentMethod: getVal(r, [
          "payment processor",
          "payment_processor",
          "payment method",
          "payment_method",
          "payment gateway",
          "payment_gateway",
          "gateway",
          "processor",
        ]),
      };
    })
    .filter((r) => r.email);
}

interface BTRow {
  fullName: string;
  email: string;
  phone: string;
  intake: string; // "May", "June" — from the Date column
  price: number; // optional override; falls back to session.programPrice if 0
}

function parseBTRows(rows: Record<string, any>[]): BTRow[] {
  return rows
    .map((r) => {
      const first = getVal(r, ["First Name", "FirstName", "first_name"]);
      const last = getVal(r, ["Last Name", "LastName", "last_name"]);
      const fullNameDirect = getVal(r, [
        "Name",
        "Full Name",
        "FullName",
        "name",
      ]);
      const dateRaw = getVal(r, [
        "Date",
        "date",
        "Intake",
        "intake",
        "Intake Date",
        "Month",
        "month",
        "Date of VW",
        "date of vw",
        "VW Date",
        "VW",
      ]);
      const priceRaw = getVal(r, [
        "Price",
        "price",
        "Amount",
        "amount",
        "Total",
        "total",
        "Amount Paid",
        "amount paid",
        "Paid",
        "paid",
      ]);
      const priceNum = Number(
        String(priceRaw).replace(/[^0-9.\-]/g, "")
      );
      return {
        fullName: fullNameDirect || `${first} ${last}`.trim(),
        email: getVal(r, ["Email", "email", "Email Address"]).toLowerCase(),
        phone: getVal(r, [
          "Phone Number",
          "phone number",
          "Phone",
          "phone",
          "Mobile",
          "telephone",
          "Telephone",
        ]),
        intake: extractIntake(dateRaw),
        price: Number.isFinite(priceNum) ? priceNum : 0,
      };
    })
    .filter((r) => r.email || r.phone);
}

// ============ Main entry ============

export interface UploadedFiles {
  everwebinarFile: File; // Everwebinar Participants export — Opt-In (registrants) + Show Up (Attended Live)
  thriveCartFile: File;
  oldStudentsFile?: File | null; // Optional: Old ATS Students (.xlsx, single column of emails)
  bankTransferFile?: File | null;
  // Optional Tag 4 List (ATS4) export from Keap (First Name, Phone 1,
  // Email). Contacts excluded from the No Show Up broadcast. Unrelated to
  // Opt-In sourcing — this app never uses Keap for Opt-In.
  nlow4File?: File | null;
}

/**
 * Parse the Old ATS Students .xlsx — a single column of emails,
 * no header row. Returns a lowercased Set for O(1) exclusion lookups.
 */
async function parseOldStudentsXlsx(
  file: File | null | undefined
): Promise<Set<string>> {
  if (!file) return new Set<string>();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out = new Set<string>();
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: "" });
    for (const row of rows) {
      for (const cell of row) {
        const s = String(cell ?? "").trim().toLowerCase();
        if (s && s.includes("@")) out.add(s);
      }
    }
  }
  return out;
}

/**
 * Parse Bank Transfer Sales — accepts both .csv and .xlsx. The xlsx branch
 * reads the first sheet using the first row as headers, producing the same
 * record shape as parseCsv so parseBTRows works unchanged.
 */
async function parseBankTransfer(file: File): Promise<Record<string, any>[]> {
  const isXlsx = /\.xlsx$/i.test(file.name);
  if (!isXlsx) {
    return parseCsv<Record<string, any>>(file);
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sn = wb.SheetNames[0];
  if (!sn) return [];
  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    defval: "",
    raw: false, // stringify numbers/dates like the CSV parser does
  });
  return rows;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const INTAKE_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function extractIntake(s: string): string {
  if (!s) return "";
  const lower = s.toLowerCase();
  for (const m of INTAKE_MONTHS) {
    if (lower.includes(m)) {
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
  }
  return "";
}

function formatSessionDateLong(s: string, yearOffset = 0): string {
  if (!s) return "";
  const compact = s.replace(/\D/g, "");
  if (compact.length !== 6) return s;
  const dd = parseInt(compact.slice(0, 2), 10);
  const mm = parseInt(compact.slice(2, 4), 10);
  const yy = parseInt(compact.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return s;
  return `${dd}-${MONTHS_SHORT[mm - 1]}-${2000 + yy + yearOffset}`;
}

function monthsToExpire(sessionDate: string): number {
  // Compute months between today and (sessionDate + 1 year). Simple month-diff.
  if (!sessionDate) return 12;
  const compact = sessionDate.replace(/\D/g, "");
  if (compact.length !== 6) return 12;
  const dd = parseInt(compact.slice(0, 2), 10);
  const mm = parseInt(compact.slice(2, 4), 10);
  const yy = parseInt(compact.slice(4, 6), 10);
  const expire = new Date(2000 + yy + 1, mm - 1, dd);
  const today = new Date();
  let m =
    (expire.getFullYear() - today.getFullYear()) * 12 +
    (expire.getMonth() - today.getMonth());
  if (expire.getDate() < today.getDate()) m -= 1;
  if (m < 0) m = 0;
  if (m > 12) m = 12;
  return m;
}

export async function generateReport(
  files: UploadedFiles,
  session: SessionDetails
): Promise<ReportData> {
  const [ewRaw, tcRaw, btRaw, oldStudentsEmails, nlow4Raw] = await Promise.all([
    parseCsvAutoHeader<Record<string, any>>(
      files.everwebinarFile,
      ["email", "attended live"],
      0
    ),
    parseCsv<Record<string, any>>(files.thriveCartFile),
    files.bankTransferFile
      ? parseBankTransfer(files.bankTransferFile)
      : Promise.resolve([]),
    parseOldStudentsXlsx(files.oldStudentsFile),
    files.nlow4File
      ? parseCsv<Record<string, any>>(files.nlow4File)
      : Promise.resolve([]),
  ]);

  // Helper: is this email an Old ATS Student? (case-insensitive)
  const isOldStudent = (email: string | null | undefined): boolean => {
    if (!email) return false;
    return oldStudentsEmails.has(email.toLowerCase());
  };

  const ew = parseEverwebinarRows(ewRaw);
  const tc = parseTCRows(tcRaw);
  const bt = parseBTRows(btRaw);
  // Tag 4 List (ATS4) — Keap CRM tag-list export, unrelated to Opt-In sourcing.
  const nlow4Rows = parseKeapRows(nlow4Raw);
  const nlow4ExcludedPhones: string[] = [];
  const nlow4ExcludedEmails: string[] = [];
  for (const r of nlow4Rows) {
    if (r.fullPhone) nlow4ExcludedPhones.push(r.fullPhone.replace(/\D/g, ""));
    if (r.email) nlow4ExcludedEmails.push(r.email.toLowerCase());
  }

  const ewByEmail = new Map<string, EwRow>();
  for (const e of ew) ewByEmail.set(e.email, e);
  // Phone-based lookup: handles people who use a different email on
  // ThriveCart/Bank Transfer than the one they registered with.
  const ewByPhone = new Map<string, EwRow>();
  for (const e of ew) {
    if (e.fullPhone) ewByPhone.set(e.fullPhone, e);
  }

  // ===== Sign-ups (TC + BT) =====
  const signUpRows: SignUpRow[] = [];
  const seenSignupEmails = new Map<string, SignUpRow>();

  function resolvePhoneAndCountry(
    email: string,
    fallbackPhone: string
  ): { cc: string; local: string; fullPhone: string; country: CountryGroup } {
    const e = ewByEmail.get(email);
    if (e && (e.cc || e.local)) {
      return {
        cc: e.cc,
        local: e.local,
        fullPhone: e.fullPhone,
        country: e.country,
      };
    }
    if (fallbackPhone) {
      const { cc, local } = parseApostrophePhone(fallbackPhone);
      return {
        cc,
        local,
        fullPhone: buildFullPhone(cc, local),
        country: detectCountry(cc, local),
      };
    }
    return { cc: "", local: "", fullPhone: "", country: "INVALID" };
  }

  for (const r of tc) {
    const fullName = `${r.first} ${r.last}`.trim() || r.email;
    const resolved = resolvePhoneAndCountry(r.email, r.phone);
    const showedUp = !!ewByEmail.get(r.email)?.attendedLive;
    // Match Opt-In by email first, then by phone (same person, different
    // email between Opt-In and ThriveCart).
    const inOptIn =
      ewByEmail.has(r.email) ||
      (!!resolved.fullPhone && ewByPhone.has(resolved.fullPhone));
    const signUp: SignUpRow = {
      fullName,
      email: r.email,
      countryCode: resolved.cc,
      phoneNumber: resolved.local,
      fullPhone: resolved.fullPhone,
      country: resolved.country,
      source: "ThriveCart",
      paymentMethod: r.paymentMethod,
      pricingOption: r.packageName || r.pricingOption,
      intake: extractIntake(`${r.packageName || ""} ${r.pricingOption || ""} ${r.orderDate || ""}`),
      total: r.total,
      orderDate: r.orderDate,
      showedUp,
      inOptIn,
    };
    seenSignupEmails.set(r.email, signUp);
    signUpRows.push(signUp);
  }

  for (const r of bt) {
    const existing = r.email ? seenSignupEmails.get(r.email) : undefined;
    if (existing) {
      existing.source = "ThriveCart+BT";
      // Preserve BT row's intake / price if the TC row didn't have them
      if (!existing.intake && r.intake) existing.intake = r.intake;
      if ((!existing.total || existing.total <= 0) && r.price > 0) {
        existing.total = r.price;
      }
      // Prefer the BT row's name when the TC row's name was missing or
      // just an email fallback. The PayNow file always has an explicit Name
      // column, so its value is usually more authoritative.
      const tcNameMissing =
        !existing.fullName || existing.fullName === existing.email;
      if (tcNameMissing && r.fullName) {
        existing.fullName = r.fullName;
      }
      continue;
    }
    const resolved = resolvePhoneAndCountry(r.email, r.phone);
    const showedUp = !!(r.email && ewByEmail.get(r.email)?.attendedLive);
    const inOptIn =
      (!!r.email && ewByEmail.has(r.email)) ||
      (!!resolved.fullPhone && ewByPhone.has(resolved.fullPhone));
    const signUp: SignUpRow = {
      fullName: r.fullName || r.email,
      email: r.email,
      countryCode: resolved.cc,
      phoneNumber: resolved.local,
      fullPhone: resolved.fullPhone,
      country: resolved.country,
      source: "BT",
      paymentMethod: "PayNow",
      pricingOption: "",
      intake: r.intake || "",
      total: r.price > 0 ? r.price : session.programPrice,
      orderDate: "",
      showedUp,
      inOptIn,
    };
    if (r.email) seenSignupEmails.set(r.email, signUp);
    signUpRows.push(signUp);
  }

  const signUpEmails = new Set(
    signUpRows.map((s) => s.email).filter(Boolean)
  );

  // ===== Show up Merge (one row per UNIQUE attendee email; sum durations) =====
  // Attendee data (name/phone/country) comes straight from the Everwebinar
  // row itself — Opt-In and Show Up are the same source file, so there's no
  // separate CRM/registration file to cross-reference.
  const showUpMergeMap = new Map<string, EwRow & { totalDuration: number }>();
  for (const e of ew) {
    if (!e.attendedLive) continue;
    const ex = showUpMergeMap.get(e.email);
    if (ex) {
      ex.totalDuration += e.durationMinutes || 0;
    } else {
      showUpMergeMap.set(e.email, { ...e, totalDuration: e.durationMinutes || 0 });
    }
  }
  const showUpMerge: ShowUpMergeRow[] = Array.from(showUpMergeMap.values()).map(
    (e) => {
      const signed = signUpEmails.has(e.email);
      return {
        fullName: e.fullName,
        email: e.email,
        countryCode: e.cc,
        phoneNumber: e.local,
        fullPhone: e.fullPhone,
        country: e.country,
        durationMinutes: e.totalDuration,
        source: "Everwebinar",
        signedUp: signed,
        signedUpEmail: signed ? e.email : "",
      };
    }
  );

  // ===== Show up REG (one row per registrant) =====
  const showUpReg: ShowUpRegRow[] = ew.map((e) => ({
    firstName: e.first,
    lastName: e.last,
    fullName: e.fullName,
    email: e.email,
    countryCode: e.cc,
    phoneNumber: e.local,
    fullPhone: e.fullPhone,
    country: e.country,
    showedUp: e.attendedLive,
    signedUp: signUpEmails.has(e.email),
  }));

  // ===== Opt-Ins (every Everwebinar registrant) =====
  const optInRows: OptInRow[] = ew.map((e) => ({
    firstName: e.first,
    fullName: e.first, // matches reference report which uses just first name
    email: e.email,
    countryCode: e.cc,
    phoneNumber: e.local,
    fullPhone: e.fullPhone,
    country: e.country,
    showedUp: e.attendedLive,
    signedUp: signUpEmails.has(e.email),
  }));
  // Every attendee already has an Opt-In row from the same file, so nothing
  // is ever appended here — this app has no Keap source to fall back from.
  const showUpAddedToOptInCount = 0;

  // ===== Old ATS Students exclusion =====
  // Match by email only (case-insensitive). Excluded from Opt-In + Show Up
  // counts. Sign-ups and revenue are untouched.
  // "Show Up & Opt-In" card = # of Old Students who BOTH showed up AND were
  // present in the Opt-In list (pre-exclusion).
  const optInEmailsPreExclusion = new Set(
    optInRows.map((r) => (r.email || "").toLowerCase()).filter(Boolean)
  );
  const showUpEmailsPreExclusion = new Set(
    showUpMerge.map((r) => (r.email || "").toLowerCase()).filter(Boolean)
  );
  let oldStudentsShowUpOptInCount = 0;
  let oldStudentsShowUpCount = 0;
  for (const e of oldStudentsEmails) {
    if (showUpEmailsPreExclusion.has(e)) {
      oldStudentsShowUpCount++;
      if (optInEmailsPreExclusion.has(e)) {
        oldStudentsShowUpOptInCount++;
      }
    }
  }
  const optInRowsBeforeExclusion = optInRows.length;
  const showUpMergeBeforeExclusion = showUpMerge.length;
  // Capture matched rows by email so we can render them in the "Old Students" tab.
  const excludedFromOptInByEmail = new Map<string, OptInRow>();
  for (const r of optInRows) {
    if (isOldStudent(r.email)) excludedFromOptInByEmail.set(r.email.toLowerCase(), r);
  }
  const excludedFromShowUpByEmail = new Map<string, ShowUpMergeRow>();
  for (const r of showUpMerge) {
    if (isOldStudent(r.email)) excludedFromShowUpByEmail.set(r.email.toLowerCase(), r);
  }
  const oldStudentsExcludedList: OldStudentExclusionRow[] = [];
  const seenExcludedEmails = new Set<string>();
  for (const [email, r] of excludedFromOptInByEmail) {
    const inShow = excludedFromShowUpByEmail.has(email);
    oldStudentsExcludedList.push({
      email: r.email,
      name: r.fullName || r.firstName || "",
      country: r.country,
      foundIn: inShow ? "Opt-In + Show Up" : "Opt-In",
    });
    seenExcludedEmails.add(email);
  }
  for (const [email, r] of excludedFromShowUpByEmail) {
    if (seenExcludedEmails.has(email)) continue;
    oldStudentsExcludedList.push({
      email: r.email,
      name: r.fullName || "",
      country: r.country,
      foundIn: "Show Up",
    });
  }
  oldStudentsExcludedList.sort((a, b) =>
    (a.email || "").localeCompare(b.email || "")
  );
  // Kept separately (full contact info, pre-exclusion) so the Keap Working
  // export can still tag these attendees with the show-up tag, even though
  // they're removed from the Opt-In / Show Up report tabs below.
  const oldStudentsShowUpRows = showUpMerge.filter((r) => isOldStudent(r.email));
  const optInRowsFiltered = optInRows.filter((r) => !isOldStudent(r.email));
  const showUpMergeFiltered = showUpMerge.filter((r) => !isOldStudent(r.email));
  const oldStudentsExcludedCount =
    (optInRowsBeforeExclusion - optInRowsFiltered.length) +
    (showUpMergeBeforeExclusion - showUpMergeFiltered.length);
  // Replace mutable lists with filtered versions for all downstream metrics.
  optInRows.length = 0;
  optInRows.push(...optInRowsFiltered);
  showUpMerge.length = 0;
  showUpMerge.push(...showUpMergeFiltered);

  // ===== Country breakdowns =====
  const tally = (rows: { country: CountryGroup }[]): CountryBreakdown => {
    const out: CountryBreakdown = {
      SG: 0,
      MY: 0,
      OTHERS: 0,
      INVALID: 0,
    };
    for (const r of rows) out[r.country]++;
    return out;
  };

  const optInByCountry = tally(optInRows);
  const showUpByCountry = tally(showUpMerge);
  const signUpByCountry = tally(signUpRows);

  // ===== Metrics =====
  const optInCount = optInRows.length;
  const invalidCount = optInByCountry.INVALID;
  const optInWithoutInvalidCount = optInCount - invalidCount;
  const showUpCount = showUpMerge.length;
  const showUpPct = optInCount > 0 ? (showUpCount / optInCount) * 100 : 0;
  const attendanceAtPitchEntered = session.attendanceAtPitch ?? 0;
  // Net Attendance at Pitch excludes Old Students who showed up — same exclusion
  // pattern applied to Opt-In and Show Up. Floor at 0 if data is inconsistent.
  const attendanceAtPitch = Math.max(
    0,
    attendanceAtPitchEntered - oldStudentsShowUpCount
  );
  const attendanceAtPitchPct =
    showUpCount > 0 ? (attendanceAtPitch / showUpCount) * 100 : 0;
  const signUpCount = signUpRows.length;
  const signUpPct =
    showUpCount > 0 ? (signUpCount / showUpCount) * 100 : 0;
  // Revenue: sum each sign-up's actual total (TC carries its own line total;
  // BT uses its row Price, falling back to session.programPrice if blank)
  const revenueTotal = signUpRows.reduce(
    (sum, s) => sum + (Number(s.total) || 0),
    0
  );
  // VW intake totals: each VW row's pastSignups + count of sign-ups whose intake matches
  const signUpsByIntakeForVW: Record<string, number> = {};
  for (const vw of session.vwDates || []) {
    if (!vw.label) continue;
    const monthSignups = signUpRows.filter(
      (s) => (s.intake || "").toLowerCase() === vw.label.toLowerCase()
    ).length;
    signUpsByIntakeForVW[vw.label] = (vw.pastSignups || 0) + monthSignups;
  }

  const metrics: PreviewMetrics = {
    optInCount,
    optInWithoutInvalidCount,
    showUpCount,
    showUpPct,
    attendanceAtPitch,
    attendanceAtPitchEntered,
    attendanceAtPitchPct,
    signUpCount,
    signUpPct,
    revenueTotal,
    signUpsByIntakeForVW,
    oldStudentsExcludedCount,
    oldStudentsShowUpOptInCount,
    oldStudentsShowUpCount,
    showUpAddedToOptInCount,
  };

  // ===== Student List =====
  const previewDate = formatSessionDateLong(session.sessionDate, 0);
  const expirationDate = formatSessionDateLong(session.sessionDate, 1);
  const mte = monthsToExpire(session.sessionDate);
  const fee = (session.programPrice || 0).toFixed(2);
  const studentList: StudentListRow[] = signUpRows.map((s) => {
    const isBT = s.source === "BT";
    const gateway = isBT ? "Bank Transfer" : s.paymentMethod || "stripe";
    const ccLabel: CountryGroup = s.country;
    return {
      packageSold: s.pricingOption || "",
      name: s.fullName,
      email: s.email,
      mobile: s.fullPhone,
      mobileCountryCode: s.fullPhone ? ccLabel : "",
      expirationDate,
      monthsToExpire: mte,
      previewDate,
      speaker: `LIVE Everwebinar-${session.speaker || ""}`,
      affiliateId: "-",
      enrolmentDate: previewDate,
      currency: "SGD",
      courseFeeWGst: fee,
      amountPaid: (s.total || 0).toFixed(2),
      paymentGateway: gateway,
    };
  });

  return {
    sessionDetails: session,
    metrics,
    optInByCountry,
    showUpByCountry,
    signUpByCountry,
    optIns: optInRows,
    showUpMerge,
    showUpReg,
    signUps: signUpRows,
    studentList,
    oldStudentsExcluded: oldStudentsExcludedList,
    oldStudentsShowUpRows,
    generatedAt: new Date().toISOString(),
    nlow4ExcludedPhones,
    nlow4ExcludedEmails,
  };
}
