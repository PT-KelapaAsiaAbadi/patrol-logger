"""End-to-end test of the patrol prototype in headless Chromium.

Run from the project folder:
  python tests/make_fake_camera.py tests/fake_camera.y4m
  python tests/e2e.py

Environment variables (optional):
  CHROME_PATH      use a specific Chromium/Chrome binary
  PATROL_LIB_DIR   folder containing jsQR.js and qrcode.js, served instead of the CDNs (for offline runs)
"""
import asyncio, http.server, json, os, re, socketserver, sys, tempfile, threading
from functools import partial
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
CAMERA = ROOT / "tests" / "fake_camera.y4m"
PORT = 8765
failures = []


def check(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if not cond:
        failures.append(msg)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class QuietServer(socketserver.ThreadingTCPServer):
    """Threaded: the browser fetches every ES module at once, and a single-threaded
    server refuses the connections that do not fit its backlog."""

    allow_reuse_address = True
    daemon_threads = True


def serve():
    httpd = QuietServer(("127.0.0.1", PORT), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


_photo_batch = 0


READ_STORED_VALUES = """
() => new Promise((resolve, reject) => {
  const open = indexedDB.open('patrol_prototype_v2', 1);
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const store = open.result.transaction('values', 'readonly').objectStore('values');
    const keys = store.getAllKeys();
    const values = store.getAll();
    values.onsuccess = () => resolve({ keys: keys.result, values: values.result });
    values.onerror = () => reject(values.error);
  };
})
"""


def make_photos(count):
    """Fresh photos, unlike every earlier call, so a reused photo is only ever deliberate."""
    global _photo_batch
    _photo_batch += 1
    folder = Path(tempfile.mkdtemp())
    paths = []
    for i in range(count):
        path = folder / f"report_{i}.jpg"
        image = Image.new("RGB", (640, 480), (40 * i % 255, 120, 90))
        image.putpixel((0, 0), (_photo_batch % 255, (_photo_batch * 7) % 255, i % 255))
        image.save(path)
        paths.append(str(path))
    return paths


async def main():
    if not CAMERA.exists():
        sys.exit("Run tests/make_fake_camera.py first to create tests/fake_camera.y4m")
    httpd = serve()
    lib_dir = os.environ.get("PATROL_LIB_DIR")
    async with async_playwright() as p:
        launch = dict(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
                            f"--use-file-for-fake-video-capture={CAMERA}"])
        if os.environ.get("CHROME_PATH"):
            launch["executable_path"] = os.environ["CHROME_PATH"]
        browser = await p.chromium.launch(**launch)
        ctx = await browser.new_context(viewport={"width": 1200, "height": 900},
            permissions=["geolocation", "camera"],
            geolocation={"latitude": -7.2575, "longitude": 112.7521, "accuracy": 10})   # demo Main gate
        if lib_dir:
            async def route(r):
                u = r.request.url
                if "jsqr" in u: await r.fulfill(path=f"{lib_dir}/jsQR.js", content_type="application/javascript")
                elif "qrcode-generator" in u: await r.fulfill(path=f"{lib_dir}/qrcode.js", content_type="application/javascript")
                elif "fonts.g" in u: await r.abort()
                else: await r.continue_()
            await ctx.route("**/*", route)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")

        # ---------------- Demo data and dashboard ----------------
        await pg.click('button:has-text("Load the demo site")')
        await pg.wait_for_selector("text=Needs review", timeout=30000)
        summary = await pg.inner_text("#dashboard-content p.summary")
        check("2 checkpoint visits missed" in summary, "dashboard counts 2 missed checkpoint visits")
        check("1 rushed round" in summary, "dashboard finds the rushed round")
        check("5 scans need review" in summary, "dashboard lists 5 scans for review")
        check("3 reports from guards" in summary, "dashboard counts the 3 demo reports")
        why = " ".join(await pg.locator("#dashboard-content .review-reasons").all_inner_texts())
        for text, name in [("outside the checkpoint area", "out-of-range"),
                           ("identical to an earlier one", "reused report photo"),
                           ("same GPS position", "identical position"), ("not valid now", "old code"),
                           ("carrying two phones", "two phones"), ("well before the scan", "old report photo")]:
            check(text in why, f"dashboard explains the {name} flag")
        reports = await pg.inner_text("#dashboard-content .report-list")
        check("Padlock on the back gate" in reports, "dashboard shows the demo report text")

        # ---------------- Setup: enrollment code ----------------
        await pg.click("button.view-tab[data-view=setup]")
        await pg.locator("tr", has_text="Budi Santoso").locator('button:has-text("Create enrollment code")').click()
        code = re.search(r"(\d{6})", await pg.inner_text("#setup-status")).group(1)

        # ---------------- Guard app on a phone-sized screen ----------------
        await pg.set_viewport_size({"width": 390, "height": 844})
        await pg.click("button.view-tab[data-view=guard]")
        for sel, val in [("#enroll-guard-id", "g01"), ("#enroll-code", "000000"), ("#enroll-pin", "2468"), ("#enroll-pin-repeat", "2468")]:
            await pg.fill(sel, val)
        await pg.click("#enroll-submit"); await pg.wait_for_timeout(900)
        check("wrong" in (await pg.inner_text("#enroll-error")).lower(), "wrong enrollment code is refused")
        await pg.fill("#enroll-code", code); await pg.click("#enroll-submit")
        await pg.wait_for_selector("#screen-login.is-active")
        await pg.fill("#login-pin", "1111"); await pg.click("#login-submit"); await pg.wait_for_timeout(900)
        check("Wrong PIN" in await pg.inner_text("#login-error"), "wrong PIN is refused")
        await pg.fill("#login-pin", "2468"); await pg.click("#login-submit")
        await pg.wait_for_selector("#screen-home.is-active")

        check(await pg.locator("#home-scan").count() == 0, "home screen has no general scan button")
        check(await pg.locator(".checkpoint-button").count() == 6, "home lists the guard's 6 assigned checkpoints")

        def checkpoint(name):
            return pg.locator(".checkpoint-button", has_text=name)

        async def choose(name, answer):
            await checkpoint(name).click()
            await pg.wait_for_selector("#scan-confirm[open]")
            await pg.click(f"#scan-confirm-{answer}")

        # Tapping a checkpoint asks first; No leaves the guard on the home screen.
        await choose("Parking lot", "no")
        check(await pg.is_visible("#screen-home") and not await pg.is_visible("#scanner"), "answering No to 'Start scan?' stays on home")

        # Camera: the fake camera shows the Main gate code, so another checkpoint refuses it.
        await choose("Warehouse door", "yes")
        await pg.wait_for_function(
            "document.querySelector('#scanner-message')?.textContent.includes('different checkpoint')",
            timeout=20000)
        check(True, "camera refuses the code of a different checkpoint")
        check(await pg.locator("#scanner-capture").count() == 0, "the camera has no Capture button")
        await pg.click("#scanner-cancel"); await pg.wait_for_selector("#screen-home.is-active")

        # Camera: the chosen checkpoint's code is recorded without any button press.
        await choose("Main gate", "yes")
        await pg.wait_for_selector("#screen-report.is-active", timeout=30000)
        check(True, "camera records the chosen code with no button press")
        check("Main gate" in await pg.inner_text("#report-checkpoint"), "after the scan the guard is asked about a report")
        await pg.click("#report-no"); await pg.wait_for_selector("#screen-home.is-active")
        check(True, "answering No to the report returns home")

        # Simulated scans from here on.
        await pg.check("#home-simulate-camera")

        async def sim_scan(name, code="current", loc="at"):
            await choose(name, "yes")
            await pg.wait_for_selector("#screen-simulate.is-active")
            await pg.select_option("#sim-code", code); await pg.select_option("#sim-location", loc)
            await pg.click("#sim-submit")
            await pg.wait_for_selector("#screen-report.is-active, #screen-result.is-active", timeout=15000)
            if await pg.is_visible("#screen-report"):
                return "report:" + await pg.inner_text("#report-scan-status")
            return "result:" + await pg.inner_text("#result-status")

        # A report with a note and two photos.
        status = await sim_scan("Warehouse door")
        check(status == "report:Scan recorded", "normal simulated scan is recorded without flags")
        await pg.click("#report-yes")
        await pg.click("#report-send")
        check("at least one photo" in await pg.inner_text("#report-error"), "an empty report cannot be sent")
        await pg.fill("#report-text", "Light above the door is broken.")
        await pg.set_input_files("#report-photo-input", make_photos(2)); await pg.wait_for_timeout(600)
        check(await pg.inner_text("#report-photo-count") == "2 of 5", "two report photos are added")
        await pg.click("#report-send"); await pg.wait_for_selector("#screen-result.is-active")
        check(await pg.inner_text("#result-status") == "Report sent", "report with note and photos is sent")
        await pg.click("#result-done"); await pg.wait_for_selector("#screen-home.is-active")

        status = await sim_scan("Back fence", loc="far")
        check("will be reviewed" in status, "scan from 2 km away is flagged")
        await pg.click("#report-no"); await pg.wait_for_selector("#screen-home.is-active")

        status = await sim_scan("Generator room", code="old")
        check(status == "result:Not recorded", "old code is rejected and skips the report question")
        await pg.click("#result-done"); await pg.wait_for_selector("#screen-home.is-active")

        # Photo limit: at most 5, photos only (no note) is allowed.
        await sim_scan("Parking lot")
        await pg.click("#report-yes")
        await pg.set_input_files("#report-photo-input", make_photos(6)); await pg.wait_for_timeout(900)
        check(await pg.inner_text("#report-photo-count") == "5 of 5", "no more than 5 report photos are kept")
        check("up to 5 photos" in await pg.inner_text("#report-error"), "the guard is told about the 5 photo limit")
        check(await pg.is_disabled("#report-add-photo"), "Add photo is disabled at 5 photos")
        await pg.locator("#report-photos button").first.click()
        check(await pg.inner_text("#report-photo-count") == "4 of 5", "a report photo can be removed")
        await pg.click("#report-send"); await pg.wait_for_selector("#screen-result.is-active")
        check(await pg.inner_text("#result-status") == "Report sent", "a report with photos and no note is sent")
        await pg.click("#result-done"); await pg.wait_for_selector("#screen-home.is-active")

        # The same photo sent with a second report is flagged.
        shared_photo = make_photos(1)

        async def report_with(name, note, photos):
            await sim_scan(name)
            await pg.click("#report-yes")
            await pg.fill("#report-text", note)
            await pg.set_input_files("#report-photo-input", photos); await pg.wait_for_timeout(700)
            await pg.click("#report-send"); await pg.wait_for_selector("#screen-result.is-active")
            await pg.click("#result-done"); await pg.wait_for_selector("#screen-home.is-active")

        await report_with("Generator room", "Oil patch under the generator.", shared_photo)
        await report_with("Generator room", "The same photo as before.", shared_photo)

        # Offline: the scan and its report both wait on the phone.
        await pg.check("#home-simulate-offline"); await pg.wait_for_selector("#screen-home.is-active")
        status = await sim_scan("Office entrance")
        check("saved on this phone" in status.lower(), "scan without signal waits on the phone")
        await pg.click("#report-yes"); await pg.fill("#report-text", "Written with no signal.")
        await pg.click("#report-send"); await pg.wait_for_selector("#screen-result.is-active")
        check(await pg.inner_text("#result-status") == "Waiting to upload", "report without signal waits on the phone")
        await pg.click("#result-done"); await pg.wait_for_selector("#screen-home.is-active")
        check(await pg.inner_text("#home-queue-count") == "2", "scan and report are both queued")

        stored = await pg.evaluate(READ_STORED_VALUES)
        by_key = dict(zip(stored["keys"], stored["values"]))
        queued_scan = next(u for u in by_key["upload-queue"] if u["kind"] == "scan")
        scan_request = json.loads(queued_scan["body"])
        check("data:image" not in queued_scan["body"] and not queued_scan["photos"],
              "a queued scan request carries no image data")
        check(not [field for field in scan_request if "photo" in field.lower()],
              "a scan request has no photo field at all")
        await pg.uncheck("#home-simulate-offline"); await pg.wait_for_timeout(2500)
        check(await pg.inner_text("#home-queue-count") == "0", "queued scan and report upload when signal returns")

        # ---------------- Dashboard shows the new reports ----------------
        await pg.set_viewport_size({"width": 1200, "height": 900})
        await pg.click("button.view-tab[data-view=dashboard]")
        await pg.fill("#dashboard-night", await pg.evaluate(
            "(()=>{const d=new Date(); if(d.getHours()<12) d.setDate(d.getDate()-1); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()"))
        await pg.wait_for_timeout(800)
        reports = await pg.inner_text("#dashboard-content .report-list")
        check("Light above the door is broken." in reports and "Written with no signal." in reports,
              "dashboard shows the reports sent from the phone")
        check(reports.count("identical to an earlier one") == 1,
              "only the second of the two identical report photos is flagged")

        stored = await pg.evaluate(READ_STORED_VALUES)
        stored_photo_hashes = {k[len("photo:"):] for k in stored["keys"] if k.startswith("photo:")}
        server_state = json.loads(await pg.evaluate("localStorage.getItem('patrol_server_v2')"))
        report_photo_hashes = {h for report in server_state["reports"] for h in report["photos"]}
        check(stored_photo_hashes == report_photo_hashes and stored_photo_hashes,
              "every stored photo belongs to a report, so no scan photo is kept")
        check(not [f for entry in server_state["log"] for f in entry if "photo" in f.lower()],
              "no logged scan has a photo field")

        # ---------------- Assignments ----------------
        await pg.click("button.view-tab[data-view=setup]")
        await pg.locator('input[aria-label="Budi Santoso patrols Back fence"]').uncheck()
        await pg.click('button:has-text("Save assignments")')
        await pg.click("button.view-tab[data-view=guard]")
        # The home screen was already active, so wait for the re-rendered list rather than the screen.
        try:
            await pg.wait_for_function("document.querySelectorAll('.checkpoint-button').length === 5", timeout=5000)
        except Exception:
            pass
        names = " ".join(await pg.locator(".checkpoint-button span:first-child").all_inner_texts())
        check(await pg.locator(".checkpoint-button").count() == 5 and "Back fence" not in names, "guard only sees assigned checkpoints")

        # ---------------- Tamper detection ----------------
        await pg.click("button.view-tab[data-view=dashboard]")
        await pg.click('button:has-text("Check the log")'); await pg.wait_for_timeout(1500)
        check("unchanged" in await pg.inner_text("#dashboard-content .status-line"), "untouched log verifies")
        await pg.click("button.view-tab[data-view=setup]"); await pg.click('button:has-text("Edit a log entry")')
        await pg.click("button.view-tab[data-view=dashboard]")
        await pg.click('button:has-text("Check the log")'); await pg.wait_for_timeout(1500)
        check("was changed" in await pg.inner_text("#dashboard-content .status-line"), "edited log entry is detected")

        check(not errors, "no JavaScript errors" + (f": {errors}" if errors else ""))
        await browser.close()
    httpd.shutdown()
    print(f"\n{'All checks passed' if not failures else str(len(failures)) + ' check(s) failed'}")
    sys.exit(1 if failures else 0)


asyncio.run(main())
