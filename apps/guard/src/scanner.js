// @ts-check
/**
 * The camera screen. It reads codes continuously and records the scan as soon as the
 * chosen checkpoint's code is in view, with no button to press. No image is kept:
 * frames are decoded and discarded. Location is gathered while the camera is open.
 */
import { QR_PREFIX, SCANNER } from '../../../shared/config.js';
import { sleep } from '../../../shared/lib/async.js';
import { $ } from '../../../shared/lib/dom.js';
import { captureFrame, createQrDetector, decodeQrCode } from './image-tools.js';

/**
 * @typedef {object} CapturedScan
 * @property {{ id: string, name: string }} checkpoint
 * @property {string} qr
 * @property {string} takenAt
 * @property {{ lat: number, lng: number, accuracy: number } | null} position
 */

/**
 * @typedef {object} ScanSession
 * @property {{ id: string, name: string }} checkpoint  The checkpoint the guard chose; other codes are refused.
 * @property {boolean} finishing   A code has been accepted; stop reading.
 */

/**
 * The server decides whether a code is genuine; the phone only checks it is the chosen checkpoint's.
 * @param {string | null} text
 * @param {string} checkpointId
 * @returns {'match' | 'other-checkpoint' | 'not-patrol' | 'none'}
 */
function classifyCode(text, checkpointId) {
  if (!text) return 'none';
  const parts = text.split('|');
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return 'not-patrol';
  return parts[1] === checkpointId ? 'match' : 'other-checkpoint';
}

export class CheckpointScanner {
  #elements = {
    root: $('#scanner'),
    video: $('#scanner-video'),
    frame: $('#scanner-frame'),
    message: $('#scanner-message'),
    gps: $('#scanner-gps'),
    torch: $('#scanner-torch'),
    cancel: $('#scanner-cancel'),
  };

  /** @type {MediaStream | null} */ #stream = null;
  /** @type {MediaStreamTrack | null} */ #track = null;
  /** @type {any} */ #detector = null;
  /** @type {number | null} */ #gpsWatchId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */ #readTimer = null;
  /** @type {{ lat: number, lng: number, accuracy: number } | null} */ #bestPosition = null;
  /** @type {ScanSession | null} */
  #session = null;

  #onComplete;
  #onUnavailable;
  #onCancel;

  /**
   * @param {{ onComplete: (scan: CapturedScan) => void, onUnavailable: (reason: string) => void, onCancel: () => void }} callbacks
   */
  constructor({ onComplete, onUnavailable, onCancel }) {
    this.#onComplete = onComplete;
    this.#onUnavailable = onUnavailable;
    this.#onCancel = onCancel;
    this.#elements.torch.addEventListener('click', () => this.#toggleTorch());
    this.#elements.cancel.addEventListener('click', () => this.#cancel());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isOpen) this.#cancel();
    });
  }

  get isOpen() {
    return this.#session !== null;
  }

  /** @param {{ checkpoint: { id: string, name: string } }} options */
  async open({ checkpoint }) {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.#onUnavailable('This browser cannot open the camera here.');
      return;
    }
    this.#session = { checkpoint, finishing: false };
    this.#bestPosition = null;
    this.#elements.root.classList.add('is-active');
    this.#elements.message.textContent = `Point the camera at the code at ${checkpoint.name}.`;
    this.#startGps();

    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      this.close();
      this.#onUnavailable('The camera is blocked or not available in this viewer.');
      return;
    }

    this.#track = this.#stream.getVideoTracks()[0];
    this.#elements.video.srcObject = this.#stream;
    await this.#elements.video.play().catch(() => {});
    const capabilities = /** @type {any} */ (this.#track.getCapabilities?.() ?? {});
    this.#elements.torch.hidden = !capabilities.torch;
    this.#detector ??= await createQrDetector();
    this.#readContinuously();
  }

  close() {
    if (this.#readTimer) clearTimeout(this.#readTimer);
    this.#readTimer = null;
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#track = null;
    if (this.#gpsWatchId !== null) navigator.geolocation?.clearWatch(this.#gpsWatchId);
    this.#gpsWatchId = null;
    this.#session = null;
    this.#elements.root.classList.remove('is-active');
    this.#elements.frame.classList.remove('is-code-visible');
  }

  #cancel() {
    this.close();
    this.#onCancel();
  }

  /** Read a frame, decide what it holds, and either accept it or look again. */
  async #readContinuously() {
    const session = this.#session;
    if (!session || session.finishing || !this.#stream) return;

    const { video, frame } = this.#elements;
    if (video.readyState >= 2 && video.videoWidth) {
      const text = await decodeQrCode(captureFrame(video, SCANNER.readFrameMaxSide), this.#detector);
      const kind = classifyCode(text, session.checkpoint.id);
      frame.classList.toggle('is-code-visible', kind === 'match');
      if (kind === 'match') {
        session.finishing = true;
        await this.#finish(/** @type {string} */ (text));
        return;
      }
      this.#showAimingMessage(kind, session.checkpoint.name);
    }
    this.#readTimer = setTimeout(() => this.#readContinuously(), SCANNER.readEveryMs);
  }

  /**
   * @param {'other-checkpoint' | 'not-patrol' | 'none'} kind
   * @param {string} checkpointName
   */
  #showAimingMessage(kind, checkpointName) {
    this.#elements.message.textContent =
      kind === 'other-checkpoint'
        ? `That code belongs to a different checkpoint. Scan the code at ${checkpointName}.`
        : kind === 'not-patrol'
          ? 'That is not a patrol checkpoint code.'
          : `Point the camera at the code at ${checkpointName}.`;
  }

  /** @param {string} qr */
  async #finish(qr) {
    const session = /** @type {ScanSession} */ (this.#session);
    const takenAt = new Date().toISOString();
    this.#elements.message.textContent = 'Code read. Checking location…';

    const waitStarted = Date.now();
    while (
      (!this.#bestPosition || this.#bestPosition.accuracy > SCANNER.goodGpsAccuracyM) &&
      Date.now() - waitStarted < SCANNER.gpsWaitMs
    ) {
      await sleep(400);
    }

    const result = { checkpoint: session.checkpoint, qr, takenAt, position: this.#bestPosition };
    this.close();
    this.#onComplete(result);
  }

  #startGps() {
    const gps = this.#elements.gps;
    gps.textContent = 'Getting location…';
    if (!navigator.geolocation) {
      gps.textContent = 'This browser has no location support.';
      return;
    }
    this.#gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!this.#bestPosition || accuracy <= this.#bestPosition.accuracy) {
          this.#bestPosition = { lat: latitude, lng: longitude, accuracy };
        }
        gps.textContent = `Location found, within ${Math.round(this.#bestPosition.accuracy)} m`;
      },
      (error) => {
        gps.textContent =
          error.code === error.PERMISSION_DENIED ? 'Location is blocked for this page.' : 'Still looking for GPS.';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

  async #toggleTorch() {
    if (!this.#track) return;
    const torch = this.#elements.torch;
    const turnOn = torch.getAttribute('aria-pressed') !== 'true';
    try {
      await this.#track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: turnOn }] }));
      torch.setAttribute('aria-pressed', String(turnOn));
    } catch {
      torch.hidden = true;
    }
  }
}
