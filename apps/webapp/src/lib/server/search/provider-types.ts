import type {
  AcquisitionAttemptOutcome,
  AcquisitionSourceKind
} from "@scout/domain";

export interface ProviderSearchCandidate {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ProviderSearchResponse {
  outcome: AcquisitionAttemptOutcome;
  candidates: ProviderSearchCandidate[];
  detail?: string;
  httpStatus?: number;
}

export interface SearchProviderAdapter {
  name: string;
  kind: AcquisitionSourceKind;
  executeQuery: (
    query: string,
    limit: number,
    onProgress?: (workerNote: string) => Promise<void> | void
  ) => Promise<ProviderSearchResponse>;
  dispose?: () => Promise<void>;
}
