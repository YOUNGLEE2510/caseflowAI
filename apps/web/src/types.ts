export type Role = "requester" | "agent" | "manager" | "org_admin" | "platform_admin";
export type CaseStatus = "new" | "triaged" | "in_progress" | "waiting" | "resolved" | "closed";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface User {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  name: string;
  email: string;
  role: Role;
  team: string;
  title: string;
  avatarColor: string;
  active?: boolean;
}

export interface TimelineEvent {
  _id: string;
  type: string;
  label: string;
  actorName: string;
  createdAt: string;
}

export interface CaseComment {
  _id: string;
  authorName: string;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface CaseRecord {
  _id: string;
  code: string;
  title: string;
  description: string;
  serviceKey: string;
  category: string;
  priority: Priority;
  status: CaseStatus;
  channel: string;
  requesterId: string;
  requesterName: string;
  assigneeId?: string;
  assigneeName?: string;
  team: string;
  dueAt: string;
  resolvedAt?: string;
  closedAt?: string;
  reopenCount?: number;
  satisfaction?: number | null;
  satisfactionComment?: string;
  satisfactionAt?: string;
  createdAt: string;
  updatedAt: string;
  customFields?: Record<string, string>;
  ai: {
    classification: string;
    confidence: number;
    summary: string;
    riskScore: number;
    riskFactors: string[];
    similarCaseIds: string[];
    analyzedAt: string;
    reviewStatus: "pending" | "confirmed" | "corrected";
    reviewedAt?: string;
    reviewedByName?: string;
    humanCorrectedLabel?: string;
  };
  events: TimelineEvent[];
  comments: CaseComment[];
}

export interface ServiceDefinition {
  _id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  team: string;
  slaHours: number;
  autoAssign?: boolean;
  active?: boolean;
  requiredFields: string[];
}

export interface Attachment {
  _id: string;
  caseId: string;
  uploaderName: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface NotificationRecord {
  _id: string;
  type: string;
  title: string;
  message: string;
  relatedCaseId?: string;
  read: boolean;
  readAt?: string;
  actionUrl?: string;
  createdAt: string;
}

export interface Incident {
  _id: string;
  code: string;
  title: string;
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "monitoring" | "investigating" | "mitigated" | "resolved";
  team: string;
  affectedCount: number;
  detectedAt: string;
  caseIds: Array<Pick<CaseRecord, "_id" | "code" | "title" | "status" | "priority">>;
  signal: {
    clusterScore: number;
    growthRate: number;
    keywords: string[];
  };
}

export interface KnowledgeArticle {
  _id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  sourceLabel: string;
  version: string;
  effectiveAt: string;
  sourceUrl?: string;
  status?: "draft" | "published";
  authorId?: string;
  reviewedByName?: string;
}

export interface DashboardData {
  metrics: {
    open: number;
    openTrend: number | null;
    atRisk: number;
    atRiskTrend: number | null;
    resolved: number;
    resolvedTrend: number | null;
    activeIncidents: number;
    activeIncidentsTrend: number | null;
    averageResolutionHours: number;
  };
  statusDistribution: Array<{ name: CaseStatus; value: number }>;
  teamWorkload: Array<{ team: string; open: number; risk: number }>;
  recentCases: CaseRecord[];
  highRiskCases: CaseRecord[];
  incidents: Incident[];
}
