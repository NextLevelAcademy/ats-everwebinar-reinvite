import type {
  CountryBreakdown,
  CountryGroup,
  OptInRow,
  PreviewMetrics,
  SessionDetails,
  ShowUpMergeRow,
  SignUpRow,
  StudentListRow,
} from "../../../shared/schema";

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

function monthsToExpire(sessionDate: string): number {
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

/**
 * Passthrough counts that come from the one-time Old-Student / Tag-4
 * exclusion pass at report generation. They are not recomputed on later
 * edits — editing a row after generation adjusts counts derived directly
 * from the current row lists (below), not this historical exclusion tally.
 */
export interface DeriveMetricsPassthrough {
  oldStudentsExcludedCount: number;
  oldStudentsShowUpOptInCount: number;
  oldStudentsShowUpCount: number;
  showUpAddedToOptInCount: number;
}

export interface DerivedReportSlice {
  metrics: PreviewMetrics;
  optInByCountry: CountryBreakdown;
  showUpByCountry: CountryBreakdown;
  signUpByCountry: CountryBreakdown;
  studentList: StudentListRow[];
}

/**
 * Recomputes every metric, country breakdown, and the Student List from the
 * current Opt-In / Show Up / Sign Up row lists and session details. Used
 * both by the initial report generation and by the report page's inline
 * editing (row edits, country reclassification, session detail changes) so
 * counts and totals always stay in sync with what's on screen.
 */
export function deriveMetrics(
  session: SessionDetails,
  optInRows: OptInRow[],
  showUpMerge: ShowUpMergeRow[],
  signUpRows: SignUpRow[],
  passthrough: DeriveMetricsPassthrough
): DerivedReportSlice {
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

  const optInCount = optInRows.length;
  const invalidCount = optInByCountry.INVALID;
  const optInWithoutInvalidCount = optInCount - invalidCount;
  const showUpCount = showUpMerge.length;
  const showUpPct = optInCount > 0 ? (showUpCount / optInCount) * 100 : 0;
  const attendanceAtPitchEntered = session.attendanceAtPitch ?? 0;
  const attendanceAtPitch = Math.max(
    0,
    attendanceAtPitchEntered - passthrough.oldStudentsShowUpCount
  );
  const attendanceAtPitchPct =
    showUpCount > 0 ? (attendanceAtPitch / showUpCount) * 100 : 0;
  const signUpCount = signUpRows.length;
  const signUpPct = showUpCount > 0 ? (signUpCount / showUpCount) * 100 : 0;
  const revenueTotal = signUpRows.reduce(
    (sum, s) => sum + (Number(s.total) || 0),
    0
  );
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
    oldStudentsExcludedCount: passthrough.oldStudentsExcludedCount,
    oldStudentsShowUpOptInCount: passthrough.oldStudentsShowUpOptInCount,
    oldStudentsShowUpCount: passthrough.oldStudentsShowUpCount,
    showUpAddedToOptInCount: passthrough.showUpAddedToOptInCount,
  };

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

  return { metrics, optInByCountry, showUpByCountry, signUpByCountry, studentList };
}
