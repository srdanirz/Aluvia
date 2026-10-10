// Public API of authentication and per-emergency authorization (ADR 0013). Features import from
// "@/shared/auth"; every Server Action and route handler checks access here before touching data.
export {
  canClaimWorkItems,
  canUpdateWorksite,
  canViewContacts,
  type EmergencyAccess,
  findEmergencyAccess,
  isCoordinator,
  isMember,
  type MemberRole,
} from "./access";
export { getCurrentUser, getEmergencyAccess } from "./current-user";
export type { SessionUser } from "./session";
