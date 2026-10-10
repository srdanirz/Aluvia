import type { WorksiteReportInput } from "../schemas";

/** What the report form keeps in the phone while it is being filled. No id: that is minted on send. */
export type ReportDraft = {
  workTypeKeys: string[];
  hasVulnerablePeople: boolean;
  isPersonInDanger: boolean;
  hazards: NonNullable<WorksiteReportInput["hazards"]>;
  damageLevel: NonNullable<WorksiteReportInput["damageLevel"]> | null;
  addressText: string;
  name: string;
  phone: string;
  notifyChannel: "none" | "sms" | "whatsapp";
  notes: string;
};

export const EMPTY_DRAFT: ReportDraft = {
  workTypeKeys: [],
  hasVulnerablePeople: false,
  isPersonInDanger: false,
  hazards: [],
  damageLevel: null,
  addressText: "",
  name: "",
  phone: "",
  notifyChannel: "none",
  notes: "",
};

export const DAMAGE_LEVELS = ["minor", "moderate", "severe", "uninhabitable"] as const;

export const HAZARDS = ["electricity", "gas", "structure"] as const;
