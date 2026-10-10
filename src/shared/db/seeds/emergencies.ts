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
  /** Public ArcGIS layers `pnpm db:seed` imports after loading the rows (issue #44). */
  officialLayers: (
    | { kind: "area"; layerUrl: string }
    | { kind: "worksites"; layerUrl: string; addressFields: string[]; notesFields: string[] }
  )[];
};

// Reviewed seed (ADR 0009): the first emergency, docs/investigacion/01-contexto-las-condes.md.
// The area and the affected parcels come from the public layers of IDE Chile, imported live by
// `pnpm db:seed`; nothing downloaded is stored in the repo.
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
    officialLayers: [
      {
        kind: "area",
        layerUrl:
          "https://services3.arcgis.com/YLNLlpguFsVmgseb/arcgis/rest/services/Zona_Afectada_por_Aluvi%C3%B3n/FeatureServer/0",
      },
      {
        kind: "worksites",
        layerUrl:
          "https://services3.arcgis.com/YLNLlpguFsVmgseb/arcgis/rest/services/Predios_afectados/FeatureServer/0",
        addressFields: ["DIRECCION", "NUMERO", "ACLAR"],
        notesFields: ["ROL_SII"],
      },
    ],
  },
];
