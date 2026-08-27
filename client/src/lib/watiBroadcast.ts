import * as XLSX from "xlsx";
import type {
  BroadcastType,
  ReportData,
  SignUpRow,
  ShowUpMergeRow,
  WatiContact,
} from "../../../shared/schema";
import { isValidForBroadcast, normalizePhone } from "./phone";

export interface BroadcastDefinition {
  type: BroadcastType;
  label: string;
  description: string;
  templateName: string;
  defaultBroadcastName: string;
  bannerPath?: string;
  bannerLabel?: string;
  // When true, this list has no approved WATI template to send through yet —
  // the panel only offers the CSV download (for manual WhatsApp follow-up),
  // not the "Send via WATI" flow.
  downloadOnly?: boolean;
}

export const BROADCASTS: Record<BroadcastType, BroadcastDefinition> = {
  welcome: {
    type: "welcome",
    label: "Welcome",
    description:
      "All ATS sign-ups from this session. Welcome message + TG group reminder.",
    templateName: "l2_atm_welcomewati_evergreen",
    defaultBroadcastName: "ATS_Welcome",
    bannerPath: "/banners/welcome.jpg",
    bannerLabel: "Welcome banner",
  },
  no_show_up: {
    type: "no_show_up",
    label: "No Show Up",
    description:
      "Sales follow-up for opt-ins who did NOT attend the live session.",
    templateName: "ats_noshow_v1",
    defaultBroadcastName: "ATS_NoShow_Followup",
  },
  sales_follow_up: {
    type: "sales_follow_up",
    label: "Sales Follow Up",
    description:
      "Attendees who showed up but did NOT sign up — download and follow up on WhatsApp.",
    templateName: "",
    defaultBroadcastName: "ATS_Sales_Followup",
    downloadOnly: true,
  },
};

export interface BroadcastBuild {
  type: BroadcastType;
  definition: BroadcastDefinition;
  contacts: WatiContact[];
  excluded: { name: string; email: string; reason: string }[];
  // Populated only for no_show_up. Count of opt-ins filtered out via the
  // uploaded Tag 4 List CSV (ATS4 contacts).
  nlow4ExcludedCount?: number;
}

export function buildBroadcasts(report: ReportData): {
  welcome: BroadcastBuild;
  no_show_up: BroadcastBuild;
  sales_follow_up: BroadcastBuild;
} {
  const allSignUps: SignUpRow[] = report.signUps;
  const participantEmails = new Set(
    report.showUpMerge.map((r) => (r.email || "").toLowerCase()).filter(Boolean)
  );
  const optInNoShow = report.optIns.filter(
    (k) =>
      k.email &&
      !participantEmails.has(k.email.toLowerCase())
  );

  // Tag 4 List exclusion (ATS4) — filter out anyone whose phone (digits-only)
  // or email is in the uploaded Tag 4 List CSV. Empty sets when no CSV uploaded.
  const nlow4Phones = new Set(
    (report.nlow4ExcludedPhones ?? []).map((p) => p.replace(/\D/g, "")).filter(Boolean)
  );
  const nlow4Emails = new Set(
    (report.nlow4ExcludedEmails ?? []).map((e) => e.toLowerCase()).filter(Boolean)
  );
  const optInNoShowFiltered = optInNoShow.filter((k) => {
    const phoneDigits = (k.fullPhone || "").replace(/\D/g, "");
    const emailLower = (k.email || "").toLowerCase();
    if (phoneDigits && nlow4Phones.has(phoneDigits)) return false;
    if (emailLower && nlow4Emails.has(emailLower)) return false;
    return true;
  });
  const nlow4ExcludedCount = optInNoShow.length - optInNoShowFiltered.length;

  const noShowUpBuild = optInRowsToBroadcast(
    "no_show_up",
    optInNoShowFiltered.map((k) => ({
      fullName: k.fullName || k.email || "Customer",
      email: k.email,
      countryCode: k.countryCode,
      phoneNumber: k.phoneNumber,
      fullPhone: k.fullPhone,
    }))
  );
  noShowUpBuild.nlow4ExcludedCount = nlow4ExcludedCount;

  // Sales follow-up: attendees who showed up but did NOT sign up.
  const showedUpNoSignUp = report.showUpMerge.filter((r) => !r.signedUp);
  const salesFollowUpBuild = optInRowsToBroadcast(
    "sales_follow_up",
    showedUpNoSignUp.map((r) => ({
      fullName: r.fullName || r.email || "Customer",
      email: r.email,
      countryCode: r.countryCode,
      phoneNumber: r.phoneNumber,
      fullPhone: r.fullPhone,
    }))
  );

  return {
    welcome: signUpsToBroadcast("welcome", allSignUps),
    no_show_up: noShowUpBuild,
    sales_follow_up: salesFollowUpBuild,
  };
}

function signUpsToBroadcast(
  type: BroadcastType,
  rows: SignUpRow[]
): BroadcastBuild {
  const definition = BROADCASTS[type];
  const contacts: WatiContact[] = [];
  const excluded: { name: string; email: string; reason: string }[] = [];

  for (const r of rows) {
    const np = normalizePhone(r.phoneNumber || r.fullPhone, r.countryCode);
    if (!isValidForBroadcast(np)) {
      excluded.push({
        name: r.fullName,
        email: r.email,
        reason: !np.phone ? "Missing phone" : "Invalid country code",
      });
      continue;
    }
    contacts.push({
      name: r.fullName || r.email || "Customer",
      countryCode: np.countryCode,
      phone: np.phone,
      allowCampaign: true,
      allowSMS: true,
      email: r.email,
    });
  }

  const seen = new Set<string>();
  const dedup = contacts.filter((c) => {
    const key = `${c.countryCode}${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { type, definition, contacts: dedup, excluded };
}

interface OptInLike {
  fullName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  fullPhone: string;
}

function optInRowsToBroadcast(
  type: BroadcastType,
  rows: OptInLike[]
): BroadcastBuild {
  const definition = BROADCASTS[type];
  const contacts: WatiContact[] = [];
  const excluded: { name: string; email: string; reason: string }[] = [];

  for (const r of rows) {
    const np = normalizePhone(r.phoneNumber || r.fullPhone, r.countryCode);
    if (!isValidForBroadcast(np)) {
      excluded.push({
        name: r.fullName,
        email: r.email,
        reason: !np.phone ? "Missing phone" : "Invalid country code",
      });
      continue;
    }
    contacts.push({
      name: r.fullName || r.email || "Customer",
      countryCode: np.countryCode,
      phone: np.phone,
      allowCampaign: true,
      allowSMS: true,
      email: r.email,
    });
  }

  const seen = new Set<string>();
  const dedup = contacts.filter((c) => {
    const key = `${c.countryCode}${c.phone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { type, definition, contacts: dedup, excluded };
}

export function downloadWatiCsv(build: BroadcastBuild): void {
  const rows: any[][] = [
    ["Name", "CountryCode", "Phone", "AllowCampaign", "AllowSMS"],
    ...build.contacts.map((c) => [
      c.name,
      c.countryCode,
      c.phone,
      c.allowCampaign ? "TRUE" : "FALSE",
      c.allowSMS ? "TRUE" : "FALSE",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ds = new Date().toISOString().split("T")[0];
  a.download = `wati-${build.type}-${ds}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
