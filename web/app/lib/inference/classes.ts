/**
 * COCO 80-class labels in the order produced by Ultralytics YOLOv8 ONNX
 * exports. Mirrors `coco.yaml` from the ultralytics repo.
 */
export const COCO_CLASSES: readonly string[] = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
] as const

export const VEHICLE_CLASSES = new Set<string>([
  'bicycle',
  'car',
  'motorcycle',
  'bus',
  'truck',
])

export type ClassPalette = Record<string, string>

/** Stable color per class (HSL spread). */
export function buildPalette(): ClassPalette {
  const palette: ClassPalette = {}
  COCO_CLASSES.forEach((c, i) => {
    const hue = (i * 137.508) % 360 // golden-angle, well-distributed
    palette[c] = `hsl(${hue.toFixed(0)}, 80%, 60%)`
  })
  // Override the most common classes with brand-aligned colors.
  palette.person = '#00D4FF'
  palette.car = '#facc15'
  palette.truck = '#f97316'
  palette.bus = '#f97316'
  palette.motorcycle = '#a78bfa'
  return palette
}
