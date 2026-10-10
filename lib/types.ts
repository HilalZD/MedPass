export type Status = "green" | "yellow" | "unreadable";
export type Verified = "patient" | "clinician";

export type Med = {
  raw?: string;          // exact text as written on paper; review only, stripped before encoding
  name: string;
  ingredient?: string;
  strength?: string;
  frequency?: string;
  drugId?: string;       // id of the matching row in public/drugs.json
  status: Status;
  verified: Verified;
};

export type MedPassRecord = {
  v: 2;
  id: string;            // MedPass ID printed on the card, e.g. "MP-7K3Q-92XD"
  cardVersion: number;   // +1 on every reissue
  patient: { name: string; dateOfBirth?: string; sex?: "F" | "M"; bloodType?: string };
  emergency: { allergies: string[]; critical: string[] }; // printed + NOT encrypted in the QR
  conditions: { name: string; verified: Verified }[];
  meds: Med[];
  referrals: { to: string; reason?: string; status: "open" | "done" }[];
  visits: { date: string; place: string; note: string }[];
  updated: string;       // ISO date
};

export type AccessAction = "create" | "view" | "edit" | "reissue" | "failed_pin";

export type AccessLogEntry = {
  at: string;            // ISO timestamp
  facility: string;
  clinician: string;
  action: AccessAction;
};

export type Drug = {
  id: string;
  brand: string;
  ingredient: string;
  strength: string;
  form: string;
  price: number;         // LBP public price
  covered: boolean;      // on the MoPH AMAN list
};
