"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { MultiFormatReader, DecodeHintType, BarcodeFormat, HybridBinarizer, BinaryBitmap, NotFoundException } from "@zxing/library";
import type { ResultPoint } from "@zxing/library";

import { HTMLCanvasElementLuminanceSource } from "./HTMLCanvasElementLuminanceSource";

async function scan(video: HTMLVideoElement, signal: AbortSignal, callback: (text: string, points: ResultPoint[]) => void) {
  const media = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
    },
  });
  if (signal.aborted) {
    return;
  }

  signal.addEventListener("abort", () => media.getTracks().forEach(v => v.stop()));
  video.srcObject = media;
  signal.addEventListener("abort", () => video.srcObject = null);

  await video.play();

  const reader = new MultiFormatReader();
  const hint = new Map<DecodeHintType, any>([
    [DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_8,
      BarcodeFormat.EAN_13,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.CODE_128,
    ]],
  ]);

  while (true) {
    const metadata = await new Promise<VideoFrameCallbackMetadata>(resolve => video.requestVideoFrameCallback((_, metadata) => resolve(metadata)));
    if (signal.aborted) {
      return;
    }

    const canvas = new OffscreenCanvas(metadata.width, metadata.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error();
    }

    const bitmap = await createImageBitmap(video);
    ctx.drawImage(bitmap, 0, 0);
    // const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const source = new HTMLCanvasElementLuminanceSource(canvas as any as HTMLCanvasElement);
    const bin = new BinaryBitmap(new HybridBinarizer(source));

    try {
      const result = reader.decode(bin, hint);
      callback(result.getText(), result.getResultPoints());
    } catch (e) {
      if (!(e instanceof NotFoundException)) {
        throw e;
      }
    }
  }
}

export function Client() {
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [detects, addDetects] = useReducer((state: string[], [text, points]: [string, ResultPoint[]]) => {
    return [`${text} (${points.map(v => `${v.getX()},${v.getY()}`).join(",")})`, ...state.slice(0, 9)];
  }, []);

  useEffect(() => {
    const video = videoRef.current;

    if (!active) {
      return;
    }
    if (video === null) {
      return;
    }

    const abort = new AbortController();
    scan(video, abort.signal, (text, points) => addDetects([text, points])).catch(console.error);
    return () => abort.abort();
  }, [videoRef, active, addDetects]);

  return (<>
    <div>
      <button onClick={() => setActive(!active)}>{!active ? "play" : "stop"}</button>
    </div>
    <div style={{ width: 640, height: 640, objectFit: "contain" }}>
      <video ref={videoRef} autoPlay={false} playsInline={true} muted={true} />
    </div>
    <pre>
      {detects.join("\n")}
    </pre>
  </>);
}
