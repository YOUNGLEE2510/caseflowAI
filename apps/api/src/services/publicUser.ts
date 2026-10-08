import type { Types } from "mongoose";
import type { UserRole } from "../models/constants.js";

export interface PublicUserSource {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
  team?: string;
  title?: string;
  avatarColor?: string;
  active: boolean;
}

export function publicUser(user: PublicUserSource, organization?: { name: string; slug: string } | null) {
  return {
    id: String(user._id), organizationId: String(user.organizationId),
    organizationName: organization?.name || "", organizationSlug: organization?.slug || "",
    name: user.name, email: user.email, role: user.role, team: user.team,
    title: user.title, avatarColor: user.avatarColor, active: user.active
  };
}
