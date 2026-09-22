// @ts-check
/**
 * The two-step camera capture: a sharp photo of the checkpoint code, then a photo of the area around it.
 * Location is gathered in the background while the guard takes the photos.
 */
import { CAPTURE, QR_PREFIX } from '../config.js';
import { sleep } from '../lib/async.js';
import { $ } from '../lib/dom.js';
import { captureFrame, createQrDetector, decodeQrCode, measureImage, toJpeg } from './image-tools.js';

/**
 * @typedef {object} CapturedScan
 * @property {{ id: string, name: string }} checkpoint
 * @property {string} qr
 * @property {string} codePhoto
 * @property {string} codeTime
 * @property {string | null} areaPhoto
 * @property {string | null} areaTime
 * @property {'ok' | 'dark' | 'blurry' | null} areaQuality
 * @property {{ lat: number, lng: number, accuracy: number } | null} position
 */

/**
 * @typedef {object} CaptureState
 * @property {'code' | 'area'} step
 * @property {boolean} requireAreaPhoto
 * @property {boolean} retriedArea   The guard has already been asked once for a better area photo.
 * @property {boolean} busy
 * @property {string} [qr]
 * @property {string} [codePhoto]
 * @property {string} [codeTime]
 * @property {{ id: string, name: string }} checkpoint  The checkpoint the guard chose; other codes are refused.
 */

const CODE_PREFIX = `${QR_PREFIX}|`;

/**
 * @param {string | null} text
 * @param {string} checkpointId
 * @returns {'match' | 'other-checkpoint' | 'not-patrol' | 'none'}
 */
function classifyCode(text, checkpointId) {
  if (!text) return 'none';
  if (!text.startsWith(CODE_PREFIX)) return 'not-patrol';
  return text.split('|')[1] === checkpointId ? 'match' : 'other-checkpoint';
}

export class CheckpointScanner {
  #elements = {
    root: $('#scanner'),
    video: $('#scanner-video'),
    frame: $('#scanner-frame'),
    step: $('#scanner-step'),
    message: $('#scanner-message'),
    gps: $('#scanner-gps'),
    capture: $('#scanner-capture'),
    torch: $('#scanner-torch'),
    cancel: $('#scanner-cancel'),
  };

  /** @type {MediaStream | null} */ #stream = null;
  /** @type {MediaStreamTrack | null} */ #track = null;
  /** @type {any} */ #detector = null;
  /** @type {number | null} */ #gpsWatchId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */ #hintTimer = null;
  /** @type {{ lat: number, lng: number, accuracy: number } | null} */ #bestPosition = null;
  /** @type {CaptureState | null} */
  #capture = null;

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
    this.#elements.capture.addEventListener('click', () => this.#handleCapture());
    this.#elements.torch.addEventListener('click', () => this.#toggleTorch());
    this.#elements.cancel.addEventListener('click', () => this.#cancel());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isOpen) this.#cancel();
    });
  }

  get isOpen() {
    return this.#capture !== null;
  }

  /** @param {{ checkpoint: { id: string, name: string }, requireAreaPhoto: boolean }} options */
  async open({ checkpoint, requireAreaPhoto }) {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.#onUnavailable('This browser cannot open the camera here.');
      return;
    }
    this.#capture = { step: 'code', checkpoint, requireAreaPhoto, retriedArea: false, busy: false };
    this.#bestPosition = null;
    this.#elements.root.classList.add('is-active');
    this.#showStep();
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
    this.#showLiveHint();
  }

  close() {
    if (this.#hintTimer) clearTimeout(this.#hintTimer);
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
    this.#track = null;
    if (this.#gpsWatchId !== null) navigator.geolocation?.clearWatch(this.#gpsWatchId);
    this.#gpsWatchId = null;
    this.#capture = null;
    this.#elements.root.classList.remove('is-active');
    this.#elements.frame.classList.remove('is-code-visible', 'is-wide');
  }

  #cancel() {
    this.close();
    this.#onCancel();
  }

  #showStep() {
    const capture = /** @type {CaptureState} */ (this.#capture);
    const totalSteps = capture.requireAreaPhoto ? 2 : 1;
    const { step, message, frame, capture: captureButton } = this.#elements;
    if (capture.step === 'code') {
      step.textContent = `Step 1 of ${totalSteps}: checkpoint code`;
      message.textContent = 'Fill the square with the code, hold still, then tap Capture.';
      frame.classList.remove('is-wide');
    } else {
      step.textContent = 'Step 2 of 2: the area around it';
      message.textContent = 'Step back so the checkpoint and its surroundings are in view, then tap Capture.';
      frame.classList.remove('is-code-visible');
      frame.classList.add('is-wide');
    }
    captureButton.disabled = false;
  }

  /** While aiming at the code, outline the frame when a patrol code is readable. Saving is always manual. */
  async #showLiveHint() {
    if (this.#capture?.step !== 'code' || !this.#stream) return;
    const { video, frame } = this.#elements;
    if (video.readyState >= 2 && video.videoWidth && !this.#capture.busy) {
      const text = await decodeQrCode(captureFrame(video), this.#detector);
      frame.classList.toggle('is-code-visible', classifyCode(text, this.#capture.checkpoint.id) === 'match');
    }
    this.#hintTimer = setTimeout(() => this.#showLiveHint(), CAPTURE.liveHintEveryMs);
  }

  async #handleCapture() {
    const capture = this.#capture;
    if (!capture || capture.busy || !this.#stream) return;
    capture.busy = true;
    this.#elements.capture.disabled = true;
    this.#elements.message.textContent = 'Hold still…';
    try {
      if (capture.step === 'code') await this.#captureCode();
      else await this.#captureArea();
    } finally {
      if (this.#capture) {
        this.#capture.busy = false;
        this.#elements.capture.disabled = false;
      }
    }
  }

  /** Tapping shakes the phone, so take a short burst and keep the sharpest frame whose code can be read. */
  async #captureCode() {
    const capture = /** @type {CaptureState} */ (this.#capture);
    /** @type {Set<string>} */
    const seen = new Set();
    for (const frame of await this.#burst()) {
      const text = await decodeQrCode(frame.canvas, this.#detector);
      const kind = classifyCode(text, capture.checkpoint.id);
      seen.add(kind);
      if (kind !== 'match') continue;
      Object.assign(capture, { qr: text, codePhoto: toJpeg(frame.canvas), codeTime: new Date().toISOString() });
      if (capture.requireAreaPhoto) {
        capture.step = 'area';
        this.#showStep();
      } else {
        await this.#finish(null, null, null);
      }
      return;
    }
    this.#elements.message.textContent = seen.has('other-checkpoint')
      ? `That code belongs to a different checkpoint. Scan the code at ${capture.checkpoint.name}.`
      : seen.has('not-patrol')
        ? 'That is not a patrol checkpoint code.'
        : 'The code could not be read in the photo. Move closer, hold still, and try again.';
  }

  async #captureArea() {
    const capture = /** @type {CaptureState} */ (this.#capture);
    const secondsSinceCode = (Date.now() - Date.parse(capture.codeTime ?? '')) / 1000;
    if (secondsSinceCode > CAPTURE.maxSecondsBetweenPhotos) {
      Object.assign(capture, {
        step: 'code',
        qr: undefined,
        codePhoto: undefined,
        codeTime: undefined,
        retriedArea: false,
      });
      this.#showStep();
      this.#elements.message.textContent = 'Too much time passed. Capture the code again.';
      this.#showLiveHint();
      return;
    }

    const [best] = await this.#burst();
    /** @type {'ok' | 'dark' | 'blurry'} */
    let quality = 'ok';
    if (best.brightness < CAPTURE.minBrightness) quality = 'dark';
    else if (best.sharpness < CAPTURE.minSharpness) quality = 'blurry';

    // Ask once for a better photo; accept the second attempt either way so the guard is never stuck.
    if (quality !== 'ok' && !capture.retriedArea) {
      capture.retriedArea = true;
      this.#elements.message.textContent =
        quality === 'dark'
          ? 'Too dark. Turn on the torch or find light, then capture again.'
          : 'Blurry. Hold still and capture again.';
      return;
    }
    await this.#finish(toJpeg(best.canvas), new Date().toISOString(), quality);
  }

  /** @param {string | null} areaPhoto @param {string | null} areaTime @param {'ok' | 'dark' | 'blurry' | null} areaQuality */
  async #finish(areaPhoto, areaTime, areaQuality) {
    const capture = /** @type {CaptureState} */ (this.#capture);
    this.#elements.capture.disabled = true;
    this.#elements.message.textContent = 'Photos taken. Checking location…';

    const waitStarted = Date.now();
    while (
      (!this.#bestPosition || this.#bestPosition.accuracy > CAPTURE.goodGpsAccuracyM) &&
      Date.now() - waitStarted < CAPTURE.gpsWaitMs
    ) {
      await sleep(400);
    }

    const result = {
      checkpoint: capture.checkpoint,
      qr: /** @type {string} */ (capture.qr),
      codePhoto: /** @type {string} */ (capture.codePhoto),
      codeTime: /** @type {string} */ (capture.codeTime),
      areaPhoto,
      areaTime,
      areaQuality,
      position: this.#bestPosition,
    };
    this.close();
    this.#onComplete(result);
  }

  async #burst() {
    const frames = [];
    for (let i = 0; i < CAPTURE.burstFrames; i++) {
      const canvas = captureFrame(this.#elements.video);
      frames.push({ canvas, ...measureImage(canvas) });
      await sleep(CAPTURE.burstGapMs);
    }
    return frames.sort((a, b) => b.sharpness - a.sharpness);
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
