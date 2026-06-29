import type { Member } from "../domain/Member";

export interface MemberSummaryDTO {
  id: string;
  displayName: string | null;
  email: string | null;
  balance: number;
  tier: string;
  enrolledAt: string;
}

export function toMemberSummaryDTO(member: Member): MemberSummaryDTO {
  return {
    id: member.id.value,
    displayName: member.displayName,
    email: member.email,
    balance: member.balance,
    tier: member.currentTier,
    enrolledAt: member.enrolledAt.toISOString(),
  };
}

export interface MemberDTO {
  memberId: string;
  tenantId: string;
  passId: string;
  displayName: string | null;
  email: string | null;
  balance: number;
  currentTier: string;
  enrolledAt: string;
  status: string;
}

export interface LedgerEntryDTO {
  id: string;
  delta: number;
  reason: string;
  recordedAt: string;
}

export interface MemberActivityDTO {
  memberId: string;
  entries: LedgerEntryDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export function toMemberDTO(member: Member): MemberDTO {
  return {
    memberId: member.id.value,
    tenantId: member.tenantId,
    passId: member.passId,
    displayName: member.displayName,
    email: member.email,
    balance: member.balance,
    currentTier: member.currentTier,
    enrolledAt: member.enrolledAt.toISOString(),
    status: member.status,
  };
}
