export type DomainErrorCode =
  | 'PROTECTED_ITEM'
  | 'INVALID_DECISION'
  | 'MEDIA_UNAVAILABLE'
  | 'STAGED_OUTPUT_INVALID'
  | 'SESSION_ERROR'
  | 'STORAGE_QUOTA'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export interface DomainErrorDetails {
  code: DomainErrorCode;
  operationId?: string;
  nativeErrorCode?: string | number;
  details?: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly operationId?: string;
  readonly nativeErrorCode?: string | number;

  constructor(message: string, options: DomainErrorDetails) {
    super(message);
    this.name = 'DomainError';
    this.code = options.code;
    this.operationId = options.operationId;
    this.nativeErrorCode = options.nativeErrorCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toSafeDiagnostic(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      operationId: this.operationId,
      nativeErrorCode: this.nativeErrorCode,
    };
  }
}

export class ProtectedItemError extends DomainError {
  constructor(mediaId: string, operationId?: string) {
    super(`Cannot delete or replace protected media item [${mediaId}]`, {
      code: 'PROTECTED_ITEM',
      operationId,
    });
    this.name = 'ProtectedItemError';
  }
}

export class InvalidDecisionError extends DomainError {
  constructor(message: string, operationId?: string) {
    super(message, {
      code: 'INVALID_DECISION',
      operationId,
    });
    this.name = 'InvalidDecisionError';
  }
}

export class MediaUnavailableError extends DomainError {
  constructor(mediaId: string, reason: string, operationId?: string) {
    super(`Media item [${mediaId}] is unavailable: ${reason}`, {
      code: 'MEDIA_UNAVAILABLE',
      operationId,
    });
    this.name = 'MediaUnavailableError';
  }
}

export class StagedOutputInvalidError extends DomainError {
  constructor(message: string, operationId?: string) {
    super(message, {
      code: 'STAGED_OUTPUT_INVALID',
      operationId,
    });
    this.name = 'StagedOutputInvalidError';
  }
}

export class SessionError extends DomainError {
  constructor(message: string, operationId?: string) {
    super(message, {
      code: 'SESSION_ERROR',
      operationId,
    });
    this.name = 'SessionError';
  }
}

export class ValidationFailedError extends DomainError {
  constructor(message: string, operationId?: string) {
    super(message, {
      code: 'VALIDATION_FAILED',
      operationId,
    });
    this.name = 'ValidationFailedError';
  }
}
