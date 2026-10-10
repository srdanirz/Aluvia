// Server API of the emergencies feature: reading emergencies by slug and listing the open ones.
export { type EmergencyRef, findEmergencyBySlug, listOpenEmergencies, type OpenEmergency } from "./queries";
export { findOpenEmergencies, OPEN_EMERGENCIES_TAG } from "./open-emergencies";
