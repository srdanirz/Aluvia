import type { LocalizedText } from "../schema/types";

type EmergencySeed = {
  slug: string;
  disasterTypeKey: string;
  name: LocalizedText;
  defaultLocale: string;
  timeZone: string;
  comunas: string[];
  startedAt: Date;
  officialSurveyName: string;
  emergencyNumbers: { label: LocalizedText; phone: string }[];
};

// Reviewed seed (ADR 0009): the first emergency, docs/investigacion/01-contexto-las-condes.md.
// The area is drawn or uploaded from the admin, never guessed here.
export const EMERGENCIES: EmergencySeed[] = [
  {
    slug: "las-condes-2026",
    disasterTypeKey: "mudslide",
    name: { es: "Aluvión de Las Condes", en: "Las Condes mudslide" },
    defaultLocale: "es",
    timeZone: "America/Santiago",
    comunas: ["Las Condes"],
    // The day is on record, the hour is not: local midnight of 2026-10-08.
    startedAt: new Date("2026-10-08T00:00:00-03:00"),
    officialSurveyName: "FIBE",
    emergencyNumbers: [
      { label: { es: "Ambulancia (SAMU)", en: "Ambulance (SAMU)" }, phone: "131" },
      { label: { es: "Bomberos", en: "Firefighters" }, phone: "132" },
      { label: { es: "Carabineros", en: "Police (Carabineros)" }, phone: "133" },
    ],
  },
];
