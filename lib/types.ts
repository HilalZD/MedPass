export type Status = "green" | "yellow" | "unreadable";
export type Verified = "patient" | "clinician";

export type Med = {
  raw?: string;          // exact text as written on paper; review screen only, stripped before encoding
  name: string;
  ingredient?: string;
  strength?: string;
  frequency?: string;
  drugId?: string;       // id of the matching row in public/drugs.json
  status: Status;
  verified: Verified;
};

export type MedPassRecord = {
  v: 1;
  patient: { name: string; birthYear?: number; bloodType?: string };
  emergency: { allergies: string[]; critical: string[] }; // printed + NOT encrypted
  conditions: { name: string; verified: Verified }[];
  meds: Med[];
  referrals: { to: string; reason?: string; status: "open" | "done" }[];
  visits: { date: string; place: string; note: string }[];
  updated: string; // ISO date
};

export type Drug = {
  id: string;
  brand: string;
  ingredient: string;
  strength: string;
  form: string;
  price: number;   // LBP public price
  covered: boolean; // on the MoPH-provided medicines (AMAN) list
};
