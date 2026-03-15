export interface ScanResult {
  file: string;
  line: number;
  command: string;
  packages: string[];
}

export interface ValidationResult {
  name: string;
  exists: boolean;
  error?: string;
  httpStatus?: number;
  isSecurityHold?: boolean;
  isUnpublished?: boolean;
}

export interface Finding {
  package: string;
  status: 'not_found' | 'unpublished' | 'security_hold' | 'error';
  locations: Array<{ file: string; line: number; command: string }>;
}

export interface SlopcheckResult {
  version: string;
  scanned: number;
  packages: {
    total: number;
    valid: number;
    notFound: number;
    unpublished: number;
    securityHold: number;
    errors: number;
  };
  findings: Finding[];
}

export interface CLIOptions {
  paths: string[];
  json: boolean;
  concurrency: number;
  ignore: string[];
  noSecurityHold: boolean;
}
