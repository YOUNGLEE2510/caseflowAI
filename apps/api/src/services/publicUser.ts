import type { Types } from "mongoose";
import type { UserRole } from "../models/constants.js";
import { config } from "../config.js";

export interface PublicUserSource {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
  personnelManager?: boolean;
  tokenVersion?: number;
  team?: string;
  title?: string;
  avatarColor?: string;
  active: boolean;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
}

export function publicUser(user: PublicUserSource, organization?: { name: string; slug: string } | null, mfaVerified = false) {
  return {
    id: String(user._id), organizationId: String(user.organizationId),
    organizationName: organization?.name || "", organizationSlug: organization?.slug || "",
    name: user.name, email: user.email, role: user.role, team: user.team,
    personnelManager: Boolean(user.personnelManager),
    title: user.title, avatarColor: user.avatarColor, active: user.active,
    mustChangePassword: Boolean(user.mustChangePassword), mfaEnabled: Boolean(user.mfaEnabled),
    securityRequired: Boolean(user.mustChangePassword || (user.mfaEnabled && !mfaVerified) || (config.DEPLOYMENT_MODE === "pilot" && ["org_admin", "platform_admin"].includes(user.role) && !user.mfaEnabled))
  };
}
