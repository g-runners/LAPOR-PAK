import {
  CAMERA_TILT_DEGREES,
  CAMERA_VERTICAL_FOV_DEGREES,
  MORIS_MODEL_URL
} from "./supabase-config.js";

const INPUT_SIZE = 640;
const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 20;
const SEVERITY_THRESHOLDS_CM = Object.freeze({ light: 30, moderate: 60 });
let modelPromise;

function loadModel() {
  if (!window.ort?.InferenceSession) {
    throw new Error("ONNX Runtime Web belum termuat.");
  }
  if (!modelPromise) {
    window.ort.env.wasm.numThreads = 1;
    window.ort.env.wasm.wasmPaths =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
    modelPromise = window.ort.InferenceSession.create(MORIS_MODEL_URL, {
      executionProviders: ["wasm"]
    });
  }
  return modelPromise;
}

function prepareImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Browser tidak dapat memproses foto.");

  context.fillStyle = "rgb(114,114,114)";
  context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  const scale = Math.min(INPUT_SIZE / image.width, INPUT_SIZE / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const padX = Math.floor((INPUT_SIZE - width) / 2);
  const padY = Math.floor((INPUT_SIZE - height) / 2);
  context.drawImage(image, padX, padY, width, height);

  const pixels = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const planeSize = INPUT_SIZE * INPUT_SIZE;
  const tensorData = new Float32Array(3 * planeSize);
  for (let index = 0; index < planeSize; index += 1) {
    tensorData[index] = pixels[index * 4] / 255;
    tensorData[planeSize + index] = pixels[index * 4 + 1] / 255;
    tensorData[planeSize * 2 + index] = pixels[index * 4 + 2] / 255;
  }

  return { canvas, tensorData, scale, padX, padY };
}

function intersectionOverUnion(first, second) {
  const left = Math.max(first.x1, second.x1);
  const top = Math.max(first.y1, second.y1);
  const right = Math.min(first.x2, second.x2);
  const bottom = Math.min(first.y2, second.y2);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const firstArea = (first.x2 - first.x1) * (first.y2 - first.y1);
  const secondArea = (second.x2 - second.x1) * (second.y2 - second.y1);
  return intersection / Math.max(firstArea + secondArea - intersection, 1e-8);
}

function decodeDetections(output, image, transform) {
  const [, channels, candidates] = output.dims;
  if (channels !== 5) {
    throw new Error(`Bentuk keluaran model tidak dikenali: ${output.dims.join("×")}.`);
  }

  const values = output.data;
  const detections = [];
  for (let index = 0; index < candidates; index += 1) {
    const confidence = values[4 * candidates + index];
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const centerX = values[index];
    const centerY = values[candidates + index];
    const boxWidth = values[2 * candidates + index];
    const boxHeight = values[3 * candidates + index];
    const x1 = Math.max(0, Math.min(image.width, (centerX - boxWidth / 2 - transform.padX) / transform.scale));
    const y1 = Math.max(0, Math.min(image.height, (centerY - boxHeight / 2 - transform.padY) / transform.scale));
    const x2 = Math.max(0, Math.min(image.width, (centerX + boxWidth / 2 - transform.padX) / transform.scale));
    const y2 = Math.max(0, Math.min(image.height, (centerY + boxHeight / 2 - transform.padY) / transform.scale));
    if (x2 <= x1 || y2 <= y1) continue;
    detections.push({ x1, y1, x2, y2, confidence });
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const candidate of detections) {
    if (kept.every((item) => intersectionOverUnion(candidate, item) <= IOU_THRESHOLD)) {
      kept.push(candidate);
      if (kept.length >= MAX_DETECTIONS) break;
    }
  }
  return kept;
}

function groundPointFromPixel(x, y, imageWidth, imageHeight, cameraHeightCm) {
  const verticalFovRadians = CAMERA_VERTICAL_FOV_DEGREES * Math.PI / 180;
  const tiltRadians = CAMERA_TILT_DEGREES * Math.PI / 180;
  const focalPixels = imageHeight / (2 * Math.tan(verticalFovRadians / 2));
  const normalizedX = (x - imageWidth / 2) / focalPixels;
  const normalizedYUp = (imageHeight / 2 - y) / focalPixels;
  const downComponent = Math.sin(tiltRadians) - normalizedYUp * Math.cos(tiltRadians);
  if (downComponent <= 0) return null;

  const rayScale = cameraHeightCm / downComponent;
  return {
    x: rayScale * normalizedX,
    y: rayScale * (normalizedYUp * Math.sin(tiltRadians) + Math.cos(tiltRadians))
  };
}

function estimateBoxDimensions(detection, image, cameraHeightCm) {
  if (!Number.isFinite(cameraHeightCm) || cameraHeightCm <= 0) return null;
  const corners = [
    [detection.x1, detection.y1],
    [detection.x2, detection.y1],
    [detection.x2, detection.y2],
    [detection.x1, detection.y2]
  ].map(([x, y]) => groundPointFromPixel(x, y, image.width, image.height, cameraHeightCm));

  if (corners.some((point) => point === null)) return null;
  const edgeLengths = corners.map((point, index) => {
    const next = corners[(index + 1) % corners.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const dimensions = edgeLengths.sort((a, b) => b - a).slice(0, 2);
  const longestCm = Math.max(...dimensions);
  const damageLevel =
    longestCm < SEVERITY_THRESHOLDS_CM.light ? "Ringan" :
    longestCm < SEVERITY_THRESHOLDS_CM.moderate ? "Sedang" : "Parah";
  return { lengthCm: dimensions[0], widthCm: dimensions[1], longestCm, damageLevel };
}

export async function detectRoadDamage(file, cameraHeightCm = null) {
  const image = await createImageBitmap(file);
  try {
    const transform = prepareImage(image);
    const session = await loadModel();
    const inputName = session.inputNames[0];
    const tensor = new window.ort.Tensor("float32", transform.tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const outputMap = await session.run({ [inputName]: tensor });
    const output = outputMap[session.outputNames[0]];
    if (!output) throw new Error("Model MORIS tidak mengembalikan hasil deteksi.");

    const detections = decodeDetections(output, image, transform).map((detection) => ({
      ...detection,
      estimate: estimateBoxDimensions(detection, image, cameraHeightCm)
    }));
    const measured = detections
      .filter((detection) => detection.estimate)
      .sort((a, b) => b.estimate.longestCm - a.estimate.longestCm)[0];

    return {
      detected: detections.length > 0,
      confidence: detections[0]?.confidence ?? null,
      detections,
      damageLevel: measured?.estimate.damageLevel ?? null,
      estimatedDimensions: measured?.estimate ?? null,
      imageWidth: image.width,
      imageHeight: image.height
    };
  } finally {
    image.close();
  }
}
