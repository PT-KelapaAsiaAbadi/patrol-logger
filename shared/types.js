// @ts-check
/**
 * Shared data shapes, documented once for the whole app.
 * This module has no runtime code; other modules import the types with
 * `import('./types.js').Guard` in JSDoc comments.
 *
 * @typedef {{ lat: number, lng: number }} Position
 *
 * @typedef {object} EnrollmentCode
 * @property {string} code
 * @property {number} expiresAt
 * @property {number} attempts
 *
 * @typedef {object} EnrolledDevice
 * @property {JsonWebKey} publicKey   Public half of the phone's signing key.
 * @property {number} sequence        Number of the last scan received from this phone.
 * @property {string} lastHash        Hash of the last scan request, for the phone's own chain.
 * @property {number} enrolledAt
 *
 * @typedef {{ hash: string, expiresAt: number }} ShiftSession
 *
 * @typedef {object} Guard
 * @property {string} id
 * @property {string} name
 * @property {'guard' | 'supervisor'} role
 * @property {boolean} active
 * @property {number} failedPins
 * @property {string} [pinSalt]
 * @property {string} [pinHash]
 * @property {EnrolledDevice | null} device
 * @property {ShiftSession | null} session
 * @property {ShiftSession | null} [previousSession]  Kept so scans queued offline can still upload.
 * @property {EnrollmentCode | null} enrollment
 * @property {string[] | null} [assignedCheckpointIds]  Checkpoints this guard patrols. Null or missing means all.
 *
 * @typedef {object} Checkpoint
 * @property {string} id
 * @property {string} name
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number} radius     Allowed distance in metres.
 * @property {string} token      Secret printed inside the QR code.
 * @property {number} version    Increases every time the code is replaced.
 * @property {boolean} active
 *
 * @typedef {{ start: string, end: string, everyMinutes: number }} RoundSettings
 *
 * @typedef {object} ServerConfig
 * @property {boolean} rejectClearlyOutOfRange
 * @property {number} defaultRadiusM
 * @property {number} maxAccuracyM
 * @property {number} maxSpeedKmh
 * @property {number} duplicateWindowMin
 * @property {number} lateUploadMin
 * @property {number} shiftHours
 *
 * @typedef {object} LogEntry
 * @property {string} scanId
 * @property {number} time           When the scan was taken (phone clock).
 * @property {number} receivedAt     When the server received it.
 * @property {string} guardId
 * @property {string} guardName
 * @property {string} checkpointId
 * @property {string} checkpointName
 * @property {'ACCEPTED' | 'REJECTED'} result
 * @property {string[]} flags
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number | null} accuracy
 * @property {number | null} distance
 * @property {string} [prevHash]
 * @property {string} [hash]
 *
 * @typedef {{ verdict: 'fine' | 'suspicious', at: number }} Review
 *
 * @typedef {object} ScanOutcome
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string} [checkpointName]
 * @property {boolean} [flagged]
 * @property {number} [receivedAt]
 * @property {boolean} [needsLogin]
 * @property {boolean} [needsEnrollment]
 *
 * @typedef {object} ServerState
 * @property {number} version
 * @property {Guard[]} guards
 * @property {Checkpoint[]} checkpoints
 * @property {RoundSettings} rounds
 * @property {LogEntry[]} log
 * @property {Record<string, Review>} reviews
 * @property {Report[]} reports
 * @property {Record<string, ScanOutcome>} outcomes      Results by scan ID, so retried uploads get the same answer.
 * @property {Record<string, string>} reportPhotoHashes  Every report photo hash seen, mapped to the report that sent it.
 * @property {ServerConfig} config
 *
 * @typedef {object} ScanDetails
 * @property {string} scanId
 * @property {string} qr
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number | null} accuracy
 * @property {string} takenAt          When the phone read the code, as an ISO string.
 *
 * @typedef {object} Report
 * @property {string} reportId
 * @property {string} scanId           The scan this report follows.
 * @property {string} guardId
 * @property {string} guardName
 * @property {string} checkpointId
 * @property {string} checkpointName
 * @property {number} time             When the guard wrote it (phone clock).
 * @property {number} receivedAt
 * @property {string} text
 * @property {string[]} photos         Photo hashes, 0 to 5.
 * @property {string[]} flags
 *
 * @typedef {{ dataUrl: string, takenAt: number }} ReportPhoto
 *
 * @typedef {{ ok: false, error: string, needsEnrollment?: boolean }} FailedResponse
 * @typedef {{ ok: true, guardId: string, name: string, role: 'guard' | 'supervisor' } | FailedResponse} EnrollResponse
 * @typedef {{ ok: true, sessionToken: string, expiresAt: number, name: string,
 *   role: 'guard' | 'supervisor' } | FailedResponse} ShiftResponse
 */
export {};
