import * as XLSX from "xlsx";
import type { ReportData } from "../../../shared/schema";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

function formatDDMMYY(s: string): string {
  if (!s) return "";
  return s.replace(/\D/g, "").padEnd(6, "").slice(0, 6);
}

export function downloadExcelReport(report: ReportData): void {
  const wb = XLSX.utils.book_new();
  const session = report.sessionDetails;
  const m = report.metrics;
  const sessionLong = formatSessionDateLong(session.sessionDate);

  // ============ Sheet 1: Report ============
  // Mirror the reference layout exactly (cell-addressed).
  const rep: any[][] = [];
  // Helper to ensure rows/cols exist
  const setCell = (row: number, col: number, value: any) => {
    // row, col are 0-indexed
    while (rep.length <= row) rep.push([]);
    while (rep[row].length <= col) rep[row].push("");
    rep[row][col] = value;
  };

  // Col indices: 0=A, 1=B, 2=C, 3=D, 4=E, 5=F, 6=G
  setCell(0, 1, "ATS SG Everwebinar Reinvite"); // B1
  setCell(1, 1, "Speaker:"); // B2
  setCell(1, 2, session.speaker || ""); // C2
  setCell(2, 1, "Opt in");
  setCell(2, 2, m.optInCount);
  setCell(3, 1, "Opt in (without Invalid)");
  setCell(3, 2, m.optInWithoutInvalidCount);
  setCell(4, 1, "Show up");
  setCell(4, 2, m.showUpCount);
  setCell(4, 3, `${m.showUpPct.toFixed(1)}%`);
  setCell(5, 1, "Attendance at pitch");
  setCell(5, 2, m.attendanceAtPitch);
  setCell(5, 3, `${m.attendanceAtPitchPct.toFixed(1)}%`);
  setCell(6, 1, "Sign up");
  setCell(6, 2, m.signUpCount);
  setCell(6, 3, `${m.signUpPct.toFixed(1)}%`);

  setCell(11, 1, "Rev Generated"); // B12
  setCell(12, 1, "Program Price S$");
  setCell(12, 2, session.programPrice);
  setCell(13, 1, "Total Amount Revenue Generated");
  setCell(13, 2, m.revenueTotal);
  // Per-VW-date Total Signups rows (one per VW date entry)
  let vwRow = 14;
  for (const [label, count] of Object.entries(m.signUpsByIntakeForVW)) {
    setCell(vwRow, 1, `Total Signups [${label}] for VW`);
    setCell(vwRow, 2, count);
    vwRow++;
  }

  // Country tables in cols F (5) and G (6)
  const buckets = ["SG", "MY", "OTHERS", "INVALID"] as const;
  // Opt In table — F1: "Opt In", F2: "Country" G2: "No.", F3..F9 buckets, F10 "Grand Total"
  setCell(0, 5, "Opt In");
  setCell(1, 5, "Country");
  setCell(1, 6, "No.");
  let total = 0;
  for (let i = 0; i < buckets.length; i++) {
    const v = (report.optInByCountry as any)[buckets[i]] || 0;
    setCell(2 + i, 5, buckets[i]);
    setCell(2 + i, 6, v);
    total += v;
  }
  setCell(2 + buckets.length, 5, "Grand Total");
  setCell(2 + buckets.length, 6, total);

  // Show Up table — F12 "Show Up" then F13 "Country" G13 "Count", F14..F20 buckets, F21 GT
  setCell(11, 5, "Show Up");
  setCell(12, 5, "Country");
  setCell(12, 6, "Count");
  total = 0;
  for (let i = 0; i < buckets.length; i++) {
    const v = (report.showUpByCountry as any)[buckets[i]] || 0;
    setCell(13 + i, 5, buckets[i]);
    setCell(13 + i, 6, v);
    total += v;
  }
  setCell(13 + buckets.length, 5, "Grand Total");
  setCell(13 + buckets.length, 6, total);

  // Sign Up table — F24 "Sign Up", F25 "Country", G25 "Count"
  // Reference has 5 buckets (drops INVALID/NA which are 0). We include all 7 for completeness.
  setCell(23, 5, "Sign Up");
  setCell(24, 5, "Country");
  setCell(24, 6, "Count");
  total = 0;
  for (let i = 0; i < buckets.length; i++) {
    const v = (report.signUpByCountry as any)[buckets[i]] || 0;
    setCell(25 + i, 5, buckets[i]);
    setCell(25 + i, 6, v);
    total += v;
  }
  setCell(25 + buckets.length, 5, "Grand Total");
  setCell(25 + buckets.length, 6, total);

  const reportSheet = XLSX.utils.aoa_to_sheet(rep);
  reportSheet["!cols"] = [
    { wch: 3 }, { wch: 32 }, { wch: 14 }, { wch: 12 }, { wch: 3 },
    { wch: 16 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, reportSheet, "Report");

  // ============ Sheet 2: Opt in ============
  // Columns: Name, Email Address, Phone Number, Country, Show up, Sign up
  const optInData: any[][] = [
    ["Name", "Email Address", "Phone Number", "Country", "Show up", "Sign up"],
    ...report.optIns.map((r) => [
      r.fullName,
      r.email,
      r.fullPhone,
      r.country,
      r.showedUp ? r.email : "",
      r.signedUp ? r.email : "",
    ]),
  ];
  const optInSheet = XLSX.utils.aoa_to_sheet(optInData);
  optInSheet["!cols"] = [
    { wch: 18 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 28 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, optInSheet, "Opt in");

  // ============ Sheet 3: Show up Merge ============
  // Columns: Name, Email, Phone Number, Country, Duration (min), Source, Sign up
  const showUpMergeData: any[][] = [
    ["Name", "Email", "Phone Number", "Country", "Duration (min)", "Source", "Sign up"],
    ...report.showUpMerge.map((r) => [
      r.fullName,
      r.email,
      r.fullPhone,
      r.country,
      r.durationMinutes,
      r.source,
      r.signedUpEmail,
    ]),
  ];
  const showUpMergeSheet = XLSX.utils.aoa_to_sheet(showUpMergeData);
  showUpMergeSheet["!cols"] = [
    { wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, showUpMergeSheet, "Show up Merge");

  // ============ Sheet 4: Show up REG ============
  // Columns: First Name, Last Name, Email, Phone Number, Country, Showed Up, Sign up
  const showUpRegData: any[][] = [
    ["First Name", "Last Name", "Email", "Phone Number", "Country", "Showed Up", "Sign up"],
    ...report.showUpReg.map((r) => [
      r.firstName,
      r.lastName,
      r.email,
      r.fullPhone,
      r.country,
      r.showedUp ? "Yes" : null,
      r.signedUp ? r.email : null,
    ]),
  ];
  const showUpRegSheet = XLSX.utils.aoa_to_sheet(showUpRegData);
  showUpRegSheet["!cols"] = [
    { wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, showUpRegSheet, "Show up REG");

  // ============ Sheet 5: Sign up ============
  // Columns: Name, Email, Phone Number, Country, Source, Show up
  const signUpData: any[][] = [
    ["Name", "Email", "Phone Number", "Country", "Source", "Show up"],
    ...report.signUps.map((s) => [
      s.fullName,
      s.email,
      s.fullPhone,
      s.country,
      s.source === "BT"
        ? "PayNow"
        : s.source === "ThriveCart+BT"
        ? `${s.paymentMethod || "ThriveCart"} + PayNow`
        : s.paymentMethod || "ThriveCart",
      s.showedUp ? s.email : "",
    ]),
  ];
  const signUpSheet = XLSX.utils.aoa_to_sheet(signUpData);
  signUpSheet["!cols"] = [
    { wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, signUpSheet, "Sign up");

  // ============ Sheet 6: Keap Working ============
  // Tag rules (ATS SG):
  //   Uses only ATS3 (show-up) and ATS4 (sign-up). No prefix2 "not in opt-in" tag.
  //   Show-up                          → ATS3,ATS3-DDMMYY
  //   Show-up + signed up              → ATS3,ATS3-DDMMYY,ATS4,ATS4-DDMMYY
  //   Sign-up only (no show-up)        → ATS4,ATS4-DDMMYY
  const ddmmyy = formatDDMMYY(session.sessionDate);
  const hasDate = ddmmyy.length === 6;
  const g3 = hasDate ? `ATS3,ATS3-${ddmmyy}` : "ATS3";
  const g4 = hasDate ? `ATS4,ATS4-${ddmmyy}` : "ATS4";

  const normPhone = (p: string) => (p || "").replace(/\D/g, "");
  const handledEmails = new Set<string>();
  // Bank Transfer sign-ups often carry no email — dedupe/match those by
  // phone instead, so they still get a Keap Working row and the right tags.
  const handledPhones = new Set<string>();
  const markHandled = (email: string, phone: string) => {
    if (email) handledEmails.add(email.toLowerCase());
    const p = normPhone(phone);
    if (p) handledPhones.add(p);
  };
  type WorkingRow = { first: string; email: string; phone: string; tags: string };
  const workings: WorkingRow[] = [];

  // Pass 1: All show-ups (from Merge), in deterministic order.
  // First emit show-ups who signed up + were in opt-in (matches reference),
  // then the remaining show-ups. `signedUp` already accounts for sign-ups
  // matched by phone (e.g. Bank Transfer with no email) — see reportGenerator.ts.
  const signedShowups = report.showUpMerge.filter(
    (r) => r.signedUp && r.source === "Everwebinar"
  );
  const nonSignedShowups = report.showUpMerge.filter(
    (r) => !(r.signedUp && r.source === "Everwebinar")
  );

  for (const su of signedShowups) {
    workings.push({
      first: su.fullName,
      email: su.email,
      phone: su.fullPhone,
      tags: `${g3},${g4}`,
    });
    markHandled(su.email, su.fullPhone);
  }
  for (const su of nonSignedShowups) {
    const lc = su.email.toLowerCase();
    if (lc && handledEmails.has(lc)) continue;
    // ATS: no prefix2 tag, so show-up rules collapse to just g3 / g3+g4
    const tags: string = su.signedUp ? `${g3},${g4}` : g3;
    workings.push({
      first: su.fullName,
      email: su.email,
      phone: su.fullPhone,
      tags,
    });
    markHandled(su.email, su.fullPhone);
  }

  // Pass "old students who showed up": these are excluded from the Opt-In
  // and Show Up report tabs (see reportGenerator.ts), but they did show up,
  // so they still get tagged here, same as any other show-up.
  for (const os of report.oldStudentsShowUpRows ?? []) {
    const lc = os.email.toLowerCase();
    if (lc && handledEmails.has(lc)) continue;
    const tags = os.signedUp ? `${g3},${g4}` : g3;
    workings.push({
      first: os.fullName,
      email: os.email,
      phone: os.fullPhone,
      tags,
    });
    markHandled(os.email, os.fullPhone);
  }

  // Pass 2: Sign-ups who did NOT show up. Keyed by email when present,
  // falling back to phone (Bank Transfer sign-ups are often phone-only) so
  // they still get a row instead of being silently dropped.
  for (const s of report.signUps) {
    const lc = (s.email || "").toLowerCase();
    const phoneKey = normPhone(s.fullPhone);
    if (lc) {
      if (handledEmails.has(lc)) continue;
    } else if (phoneKey) {
      if (handledPhones.has(phoneKey)) continue;
    } else {
      continue; // nothing to key this contact on — can't tag or dedupe it
    }
    // ATS: sign-up only → g4 regardless of opt-in status
    const tags = g4;
    workings.push({
      first: s.fullName,
      email: s.email,
      phone: s.fullPhone,
      tags,
    });
    markHandled(s.email, s.fullPhone);
  }

  const keapWorkingData = [
    ["First Name", "Email", "Phone 1", "Tags"],
    ...workings.map((w) => [w.first, w.email, w.phone, w.tags]),
  ];
  const keapWorkingSheet = XLSX.utils.aoa_to_sheet(keapWorkingData);
  keapWorkingSheet["!cols"] = [
    { wch: 18 }, { wch: 32 }, { wch: 14 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, keapWorkingSheet, "Keap Working");

  // ============ Sheet 7: Student List ============
  const studentHeader = [
    "Package Sold",
    "Name",
    "Email Address",
    "Mobile",
    "Mobile Country Code",
    "Welcome Msg WATI",
    "Added them into new thrivecart (Credit Card Logged in)",
    "Forex.com Port over",
    "1 mth WATI",
    "3 mth WATI",
    "6 Mths WATI",
    "Coaching Call Booked",
    "Expiration Date",
    "Months to Expire",
    "Telegram Username",
    "Preview Date",
    "Speaker",
    "TM",
    "Affiliate ID",
    "Enrolment Date",
    "Currency",
    "Course Fee w GST",
    "Amount Paid",
    "Payment Gateway (e.g PayPal, Stripe, Bank Transfer)",
  ];
  const studentData: any[][] = [
    studentHeader,
    ...report.studentList.map((s) => [
      s.packageSold,
      s.name,
      s.email,
      s.mobile,
      s.mobileCountryCode,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      s.expirationDate,
      s.monthsToExpire,
      null,
      s.previewDate,
      s.speaker,
      null,
      s.affiliateId,
      s.enrolmentDate,
      s.currency,
      s.courseFeeWGst,
      s.amountPaid,
      s.paymentGateway,
    ]),
  ];
  const studentSheet = XLSX.utils.aoa_to_sheet(studentData);
  studentSheet["!cols"] = studentHeader.map(() => ({ wch: 16 }));
  XLSX.utils.book_append_sheet(wb, studentSheet, "Student List");

  // ============ Sheet 8: Old Students ============
  // Old ATS Students who were matched (and excluded) this session.
  const oldStudentsHeader = [
    "Email",
    "Name",
    "Country",
    "Found In",
  ];
  const oldStudentsRows = report.oldStudentsExcluded ?? [];
  const oldStudentsData: any[][] = [
    oldStudentsHeader,
    ...oldStudentsRows.map((r) => [r.email, r.name, r.country, r.foundIn]),
  ];
  const oldStudentsSheet = XLSX.utils.aoa_to_sheet(oldStudentsData);
  oldStudentsSheet["!cols"] = [
    { wch: 32 },
    { wch: 22 },
    { wch: 10 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, oldStudentsSheet, "Old Students");

  // Filename
  const safeDate = ddmmyy || new Date().toISOString().split("T")[0].replace(/-/g, "");
  const filename = `ATS_Everwebinar_Reinvite_Report_${safeDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
