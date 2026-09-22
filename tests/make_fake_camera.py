"""Create a fake camera feed (Y4M video) that shows the demo site's Main gate code.

Chrome can use this file instead of a real camera:
  --use-fake-device-for-media-stream --use-file-for-fake-video-capture=fake_camera.y4m
"""
import sys
import numpy as np
import qrcode
from PIL import Image

PAYLOAD = "GP1|CP01|kdemo1x7"   # demo site checkpoint CP01 (Main gate)
W, H, SIZE, FRAMES = 640, 480, 360, 20

out = sys.argv[1] if len(sys.argv) > 1 else "fake_camera.y4m"
code = qrcode.make(PAYLOAD, box_size=8, border=4).convert("L").resize((SIZE, SIZE))
frame = Image.new("L", (W, H), 200)
frame.paste(code, ((W - SIZE) // 2, (H - SIZE) // 2))

y = np.asarray(frame, dtype=np.uint8)
uv = np.full((H // 2, W // 2), 128, np.uint8)   # grey: no colour
with open(out, "wb") as f:
    f.write(f"YUV4MPEG2 W{W} H{H} F10:1 Ip A1:1 C420jpeg\n".encode())
    for _ in range(FRAMES):
        f.write(b"FRAME\n")
        f.write(y.tobytes()); f.write(uv.tobytes()); f.write(uv.tobytes())
print("Wrote", out)
