export type BroadcastCategory = "operational" | "product" | "marketing";
export type BroadcastChannel = "email" | "site";
export type SiteAnnouncementDisplayType = "modal" | "banner";
export type BroadcastCampaignStatus = "scheduled" | "sending" | "sent" | "partially_failed" | "failed" | "cancelled";
export type BroadcastAudienceScope = "all_registered" | "therapists";
export type BroadcastVerificationFilter = "any" | "verified" | "pending" | "not_verified";
export type BroadcastOnboardingFilter = "any" | "completed" | "incomplete";
export type BroadcastPaymentFilter = "any" | "active" | "missing";
export type BroadcastProfileStatus = "draft" | "completed" | "published";

export type BroadcastAudience = {
  scope: BroadcastAudienceScope;
  profileStatuses: BroadcastProfileStatus[];
  verification: BroadcastVerificationFilter;
  onboarding: BroadcastOnboardingFilter;
  payment: BroadcastPaymentFilter;
};

export type BroadcastAudienceRecipient = {
  authUserId: string;
  accountId: string | null;
  email: string;
  displayName: string | null;
  profileStatus: BroadcastProfileStatus | null;
  verified: boolean | null;
  verificationPending: boolean;
  onboardingCompleted: boolean | null;
  paymentMethodActive: boolean | null;
};

export type BroadcastAudiencePreview = {
  totalCount: number;
  emailEligibleCount: number;
  siteEligibleCount: number;
  recipients: BroadcastAudienceRecipient[];
  recipientsTruncated: boolean;
};

export type AdminBroadcastCampaignRow = {
  id: string;
  category: BroadcastCategory;
  title: string;
  emailSubject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  audience: BroadcastAudience;
  channels: BroadcastChannel[];
  siteDisplayType: SiteAnnouncementDisplayType | null;
  status: BroadcastCampaignStatus;
  scheduledAt: string | null;
  expiresAt: string | null;
  recipientCount: number;
  emailRecipientCount: number;
  siteRecipientCount: number;
  submittedCount: number;
  deliveredCount: number;
  openedCount: number;
  failedCount: number;
  createdAt: string;
  cancelledAt: string | null;
  lastError: string | null;
};

export type ActiveSiteAnnouncement = {
  id: string;
  campaignId: string;
  displayType: SiteAnnouncementDisplayType;
  category: BroadcastCategory;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string;
  expiresAt: string | null;
};
