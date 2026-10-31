import type { ActivityLevel, DeviceOrientation } from "@/types/health";

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  still: "Still",
  light_activity: "Light movement",
  moderate_activity: "Moderate movement",
  high_activity: "High movement",
  unknown: "Unknown",
};

export const ORIENTATION_LABELS: Record<DeviceOrientation, string> = {
  face_up: "Face up",
  face_down: "Face down",
  edge_x: "Edge (X)",
  edge_y: "Edge (Y)",
  unknown: "Unknown",
};
