import type { LocalizedText } from "../schema/types";

type DisasterTypeSeed = {
  key: string;
  name: LocalizedText;
  workTypes: { key: string; name: LocalizedText }[];
  supplyTypes: { key: string; name: LocalizedText }[];
};

// Reviewed seed (ADR 0009): the only place in the repo that names a disaster or a work type.
// The work list follows docs/investigacion/03-lecciones-y-requisitos.md; the supplies, what
// volunteers asked for after the Las Condes mudslide (docs/investigacion/01-contexto-las-condes.md).
export const DISASTER_TYPES: DisasterTypeSeed[] = [
  {
    key: "mudslide",
    name: { es: "Aluvión", en: "Mudslide" },
    workTypes: [
      { key: "mud", name: { es: "Sacar barro", en: "Mud removal" } },
      { key: "water", name: { es: "Sacar agua", en: "Water removal" } },
      { key: "food", name: { es: "Comida", en: "Food" } },
      { key: "clothing", name: { es: "Ropa", en: "Clothing" } },
      { key: "roof", name: { es: "Techo", en: "Roof" } },
      { key: "medicine", name: { es: "Medicamentos", en: "Medicine" } },
      { key: "labor", name: { es: "Mano de obra", en: "Labor" } },
    ],
    supplyTypes: [
      { key: "shovels", name: { es: "Palas", en: "Shovels" } },
      { key: "gloves", name: { es: "Guantes", en: "Gloves" } },
      { key: "boots", name: { es: "Botas de agua", en: "Rubber boots" } },
      { key: "buckets", name: { es: "Baldes", en: "Buckets" } },
      { key: "wheelbarrows", name: { es: "Carretillas", en: "Wheelbarrows" } },
      { key: "drinking_water", name: { es: "Agua para beber", en: "Drinking water" } },
    ],
  },
];
