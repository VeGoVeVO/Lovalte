import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import type { GoogleOverrides } from "./cardDoc";

// ── Domain types (mirror the API DTOs) ───────────────────────────────────────

/** Loyalty mechanic: how the primary value is shown (count, stamps fraction, money). */
export type LoyaltyType = "points" | "stamps" | "cashback";

export interface FieldDef {
  key: string;
  label: string;
  valueTemplate: string;
  changeMessage?: string;
}

export interface CardTemplateDTO {
  id: string;
  name: string;
  status: "draft" | "published";
  version: number;
  walletPlatform: "apple" | "google";
  brand: {
    organizationName: string;
    logoText?: string;
    backgroundColor: string;
    foregroundColor: string;
    labelColor?: string;
    headerFields: FieldDef[];
    primaryFields: FieldDef[];
    secondaryFields: FieldDef[];
    auxiliaryFields: FieldDef[];
    backFields: FieldDef[];
    iconRef?: string;
    logoRef?: string;
    stripRef?: string;
    stampIcon?: string;
    stampedRef?: string;
    unstampedRef?: string;
  };
  rewardRule: {
    pointsPerVisit: number;
    rewardThreshold: number;
    cardType: LoyaltyType;
    tierRules: { label: string; minPoints: number }[];
  };
  googleOverrides?: GoogleOverrides;
  /** Passes already issued from this template (cards live in customer wallets). */
  issuedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  name: string;
  organizationName: string;
  logoText?: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  headerFields: FieldDef[];
  primaryFields: FieldDef[];
  secondaryFields: FieldDef[];
  auxiliaryFields: FieldDef[];
  backFields: FieldDef[];
  pointsPerVisit: number;
  rewardThreshold: number;
  cardType: LoyaltyType;
  stampIcon?: string;
  /** Uploaded stamp art refs (override the Lucide stamp icon). */
  stampedRef?: string;
  unstampedRef?: string;
  /** Browser-rendered strip frames indexed by stamps earned (sent at publish). */
  stampStripRefs?: string[];
  tierRules: { label: string; minPoints: number }[];
  walletPlatform?: "apple" | "google";
  googleOverrides?: GoogleOverrides;
}

// ── Query key ─────────────────────────────────────────────────────────────────

const QK = ["card-templates"] as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTemplates() {
  return useQuery<CardTemplateDTO[], ApiError>({
    queryKey: QK,
    queryFn: () => api.get<CardTemplateDTO[]>("/api/v1/card-templates"),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation<CardTemplateDTO, ApiError, TemplateInput>({
    mutationFn: (body) => api.post<CardTemplateDTO>("/api/v1/card-templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation<CardTemplateDTO, ApiError, { id: string; input: TemplateInput }>({
    mutationFn: ({ id, input }) => api.put<CardTemplateDTO>(`/api/v1/card-templates/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation<{ id: string; version: number; status: string }, ApiError, string>({
    mutationFn: (id) => api.post(`/api/v1/card-templates/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRegisterAsset() {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    ApiError,
    { id: string; kind: "icon" | "logo" | "strip"; ref: string }
  >({
    mutationFn: ({ id, ...body }) => api.post(`/api/v1/card-templates/${id}/assets`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.del(`/api/v1/card-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
