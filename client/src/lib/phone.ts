// Phone normalization helpers
// Singapore default: 65 + 8-digit local number

export interface SplitPhone {
  countryCode: string;
  phone: string;
  fullPhone: string; // country code + local digits, no +
}

export function digitsOnly(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).replace(/\D/g, "");
}

/**
 * Normalize a raw phone string + optional country code into a clean
 * { countryCode, phone, fullPhone } structure.
 *
 * Rules:
 * - If both countryCode and phone are provided separately and look valid → use them
 * - If only one combined number → try to detect country code by length
 * - SG (8-digit, starts with 6, 8, or 9) → prefix 65
 * - Numbers starting with 65 + 8 digits → SG
 * - Numbers starting with 60 + 9-10 digits → MY
 * - Numbers starting with 852 + 8 digits → HK
 * - Numbers starting with 1 + 10 digits → US
 * - Otherwise: best-effort, leave country code blank if unknown
 */
export function normalizePhone(
  rawPhone: string | undefined | null,
  rawCountryCode?: string | undefined | null
): SplitPhone {
  const cc = digitsOnly(rawCountryCode);
  const p = digitsOnly(rawPhone);

  if (!p && !cc) return { countryCode: "", phone: "", fullPhone: "" };

  // Case 1: separate country code + reasonable local number
  if (cc && p && p.length >= 6 && p.length <= 12) {
    // Sometimes the phone field already includes the cc — strip it if so
    if (p.startsWith(cc) && p.length > cc.length + 5) {
      const stripped = p.slice(cc.length);
      return { countryCode: cc, phone: stripped, fullPhone: cc + stripped };
    }
    return { countryCode: cc, phone: p, fullPhone: cc + p };
  }

  // Case 2: only combined number — detect
  const combined = cc + p; // if cc was empty this is just p
  return detectFromCombined(combined);
}

function detectFromCombined(num: string): SplitPhone {
  if (!num) return { countryCode: "", phone: "", fullPhone: "" };

  // SG: 8 digits starting with 6/8/9 → prefix 65
  if (/^[689]\d{7}$/.test(num)) {
    return { countryCode: "65", phone: num, fullPhone: "65" + num };
  }

  // SG with country code: 65 + 8 digits
  if (/^65[689]\d{7}$/.test(num)) {
    return { countryCode: "65", phone: num.slice(2), fullPhone: num };
  }

  // HK: 852 + 8 digits
  if (/^852\d{8}$/.test(num)) {
    return { countryCode: "852", phone: num.slice(3), fullPhone: num };
  }

  // MY: 60 + 9-10 digits
  if (/^60\d{9,10}$/.test(num)) {
    return { countryCode: "60", phone: num.slice(2), fullPhone: num };
  }

  // US/CA: 1 + 10 digits
  if (/^1\d{10}$/.test(num)) {
    return { countryCode: "1", phone: num.slice(1), fullPhone: num };
  }

  // ID: 62 + 9-12 digits
  if (/^62\d{9,12}$/.test(num)) {
    return { countryCode: "62", phone: num.slice(2), fullPhone: num };
  }

  // CN: 86 + 11 digits
  if (/^86\d{11}$/.test(num)) {
    return { countryCode: "86", phone: num.slice(2), fullPhone: num };
  }

  // TH: 66 + 9 digits
  if (/^66\d{8,9}$/.test(num)) {
    return { countryCode: "66", phone: num.slice(2), fullPhone: num };
  }

  // PH: 63 + 10 digits
  if (/^63\d{10}$/.test(num)) {
    return { countryCode: "63", phone: num.slice(2), fullPhone: num };
  }

  // VN: 84 + 9 digits
  if (/^84\d{9}$/.test(num)) {
    return { countryCode: "84", phone: num.slice(2), fullPhone: num };
  }

  // AU: 61 + 9 digits
  if (/^61\d{9}$/.test(num)) {
    return { countryCode: "61", phone: num.slice(2), fullPhone: num };
  }

  // GB: 44 + 10 digits
  if (/^44\d{10}$/.test(num)) {
    return { countryCode: "44", phone: num.slice(2), fullPhone: num };
  }

  // 8 digits but doesn't match SG mobile pattern — assume SG (Adeline's note: most contacts are SG)
  if (num.length === 8) {
    return { countryCode: "65", phone: num, fullPhone: "65" + num };
  }

  // Unknown — return as-is, no country code
  return { countryCode: "", phone: num, fullPhone: num };
}

export function isValidForBroadcast(p: SplitPhone): boolean {
  return Boolean(p.countryCode && p.phone && p.phone.length >= 6);
}
