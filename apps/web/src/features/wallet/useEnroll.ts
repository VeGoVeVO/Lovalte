import { useMutation } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";

export interface EnrollLinkDto {
  url: string;
  token: string;
}

export interface PublicEnrollDto {
  passId: string;
  serialNumber: string;
  downloadToken: string;
}

export interface IssuePassDto {
  passId: string;
  serialNumber: string;
  memberId: string;
}

/** Owner/manager: mint a self-enrollment QR link for a published template. */
export function useEnrollLink() {
  return useMutation<EnrollLinkDto, ApiError, { templateId: string }>({
    mutationFn: (body) => api.post<EnrollLinkDto>("/api/v1/passes/enroll-link", body),
  });
}

/** Owner/manager: issue a pass directly to a walk-in. The member id is generated
 *  server-side-style here (a fresh UUID) - never typed by a human. */
export function useIssueDirect() {
  return useMutation<IssuePassDto, ApiError, { templateId: string }>({
    mutationFn: ({ templateId }) =>
      api.post<IssuePassDto>("/api/v1/passes", { memberId: crypto.randomUUID(), templateId }),
  });
}

/** Public (no session): a scanned enrollment token → unique member + pass. */
export function publicEnroll(token: string): Promise<PublicEnrollDto> {
  return api.post<PublicEnrollDto>("/api/v1/public/enroll", { token });
}
