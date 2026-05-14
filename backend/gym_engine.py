"""
gym_engine.py
─────────────
Angle calculation, rep counting, and form checking
for front-view exercises using 3D joint coordinates.

Joints (H3.6M 17-joint order):
  0  Pelvis    1  R.Hip     2  R.Knee    3  R.Ankle
  4  L.Hip     5  L.Knee    6  L.Ankle   7  Spine
  8  Thorax    9  Neck      10 Head
  11 L.Shoulder 12 L.Elbow  13 L.Wrist
  14 R.Shoulder 15 R.Elbow  16 R.Wrist
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Optional


# ── Angle Utilities ───────────────────────────────────────────────────────────

def calc_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Angle at joint B formed by A-B-C. Returns degrees 0-180."""
    ba = a - b
    bc = c - b
    cos_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return float(np.degrees(np.arccos(np.clip(cos_angle, -1.0, 1.0))))


# ── Exercise Definitions ──────────────────────────────────────────────────────

EXERCISES = {
    "bicep_curl": {
        "name":        "Bicep Curl",
        "description": "Keep elbows at your sides. Curl until forearm is vertical.",
        "joint_trio": {
            "left":  (11, 12, 13),   # L.Shoulder → L.Elbow → L.Wrist
            "right": (14, 15, 16),   # R.Shoulder → R.Elbow → R.Wrist
        },
        # Lowered thresholds to match real model output range
        "rep_down_threshold": 140,   # arm extended — bottom of rep
        "rep_up_threshold":    60,   # arm curled   — top of rep
    },

    "squat": {
        "name":        "Squat",
        "description": "Feet shoulder width. Go until thighs are parallel to floor.",
        "joint_trio": {
            "left":  (4, 5, 6),    # L.Hip → L.Knee → L.Ankle
            "right": (1, 2, 3),    # R.Hip → R.Knee → R.Ankle
        },
        # Adjusted for model output range
        "rep_down_threshold": 110,   # knees bent — bottom of squat
        "rep_up_threshold":   150,   # standing   — top of squat
    },
}


# ── Rep Counter State ─────────────────────────────────────────────────────────

@dataclass
class RepState:
    phase:              str   = "up"
    rep_count:          int   = 0
    form_errors:        int   = 0
    good_reps:          int   = 0
    raw_angle_history:  list  = field(default_factory=list)   # for smoothing
    smooth_angle_history: list = field(default_factory=list)  # for stall detection
    stall_count:        int   = 0
    min_angle_this_rep: float = 180.0
    max_angle_this_rep: float = 0.0


# ── Main Gym Engine ───────────────────────────────────────────────────────────

class GymEngine:
    def __init__(self):
        self.exercise_key: Optional[str] = None
        self.state       = RepState()
        self.session_reps: list = []

    def set_exercise(self, exercise_key: str):
        if exercise_key not in EXERCISES:
            raise ValueError(f"Unknown exercise: {exercise_key}")
        self.exercise_key = exercise_key
        self.state        = RepState()
        self.session_reps = []

    def reset(self):
        self.state        = RepState()
        self.session_reps = []

    def process_frame(self, joints_3d: list) -> dict:
        if self.exercise_key is None:
            return {"error": "No exercise selected"}

        joints = np.array(joints_3d, dtype=np.float32)  # (17, 3)
        ex     = EXERCISES[self.exercise_key]

        trio_l = ex["joint_trio"]["left"]
        trio_r = ex["joint_trio"]["right"]

        # ── Raw angle (average of both sides) ────────────────────────────────
        angle_l  = calc_angle(joints[trio_l[0]], joints[trio_l[1]], joints[trio_l[2]])
        angle_r  = calc_angle(joints[trio_r[0]], joints[trio_r[1]], joints[trio_r[2]])
        raw_angle = (angle_l + angle_r) / 2.0

        # ── Smooth angle — rolling average of last 6 frames ──────────────────
        self.state.raw_angle_history.append(raw_angle)
        if len(self.state.raw_angle_history) > 6:
            self.state.raw_angle_history.pop(0)
        angle = sum(self.state.raw_angle_history) / len(self.state.raw_angle_history)

        # ── Stall detection — using smoothed angle history ────────────────────
        self.state.smooth_angle_history.append(angle)
        if len(self.state.smooth_angle_history) > 20:
            self.state.smooth_angle_history.pop(0)

        stalled = False
        if len(self.state.smooth_angle_history) >= 20:
            spread  = max(self.state.smooth_angle_history) - min(self.state.smooth_angle_history)
            stalled = spread < 6.0

        # ── Track angle range for this rep ───────────────────────────────────
        self.state.min_angle_this_rep = min(self.state.min_angle_this_rep, angle)
        self.state.max_angle_this_rep = max(self.state.max_angle_this_rep, angle)

        # ── Rep counting state machine ────────────────────────────────────────
        rep_just_completed = False
        form_this_rep      = "good"
        down_thresh        = ex["rep_down_threshold"]
        up_thresh          = ex["rep_up_threshold"]

        if self.exercise_key == "bicep_curl":
            if self.state.phase == "up" and angle > down_thresh:
                self.state.phase = "down"
            elif self.state.phase == "down" and angle < up_thresh:
                self.state.phase = "up"
                rep_just_completed = True

        elif self.exercise_key == "squat":
            if self.state.phase == "up" and angle < down_thresh:
                self.state.phase = "down"
            elif self.state.phase == "down" and angle > up_thresh:
                self.state.phase = "up"
                rep_just_completed = True

        # ── Form checking ─────────────────────────────────────────────────────
        form_status  = "good"
        active_error = ""

        if self.exercise_key == "bicep_curl":
            if stalled and 65 < angle < 125:
                form_status   = "error"
                active_error  = "❌ Half rep — complete full range of motion"
                form_this_rep = "bad"
            elif self.state.phase == "down" and angle < 130:
                form_status  = "warning"
                active_error = "⚠ Extend your arm fully at the bottom"
            elif self.state.phase == "up" and angle > 70:
                form_status  = "warning"
                active_error = "⚠ Curl higher — bring wrist to shoulder level"

        elif self.exercise_key == "squat":
            l_knee     = joints[5][:2]
            r_knee     = joints[2][:2]
            l_hip      = joints[4][:2]
            r_hip      = joints[1][:2]
            knee_width = abs(l_knee[0] - r_knee[0])
            hip_width  = abs(l_hip[0]  - r_hip[0])

            if self.state.phase == "down" and angle > 125:
                form_status   = "warning"
                active_error  = "⚠ Go deeper — thighs parallel to floor"
                form_this_rep = "bad"
            elif hip_width > 0.01 and knee_width < hip_width * 0.65:
                form_status   = "error"
                active_error  = "❌ Knees caving inward — push knees out"
                form_this_rep = "bad"
            elif self.state.phase == "up" and angle < 140:
                form_status  = "warning"
                active_error = "⚠ Stand fully upright at the top"

        # ── Register completed rep ────────────────────────────────────────────
        if rep_just_completed:
            self.state.rep_count += 1
            if form_this_rep == "good":
                self.state.good_reps  += 1
            else:
                self.state.form_errors += 1
            self.session_reps.append({
                "rep":       self.state.rep_count,
                "min_angle": round(self.state.min_angle_this_rep, 1),
                "max_angle": round(self.state.max_angle_this_rep, 1),
                "form":      form_this_rep,
            })
            self.state.min_angle_this_rep = 180.0
            self.state.max_angle_this_rep = 0.0

        arc_color = (
            "#00ff88" if form_status == "good"    else
            "#ff6b35" if form_status == "warning" else
            "#ff0055"
        )

        # Debug print — shows in Railway logs
        print(f"[GYM] angle={round(angle,1):6.1f} raw={round(raw_angle,1):6.1f} "
              f"phase={self.state.phase} reps={self.state.rep_count} form={form_status}")

        return {
            "exercise":            self.exercise_key,
            "exercise_name":       ex["name"],
            "angle":               round(angle, 1),
            "angle_l":             round(angle_l, 1),
            "angle_r":             round(angle_r, 1),
            "phase":               self.state.phase,
            "rep_count":           self.state.rep_count,
            "rep_just_completed":  rep_just_completed,
            "form_status":         form_status,
            "active_error":        active_error,
            "arc_color":           arc_color,
            "good_reps":           self.state.good_reps,
            "form_errors":         self.state.form_errors,
            "stalled":             stalled,
            "key_joints": {
                "a": joints[trio_l[0]].tolist(),
                "b": joints[trio_l[1]].tolist(),
                "c": joints[trio_l[2]].tolist(),
            },
        }

    def get_session_summary(self) -> dict:
        total = self.state.rep_count
        good  = self.state.good_reps
        score = round((good / total * 100) if total > 0 else 0, 1)
        return {
            "exercise":      self.exercise_key,
            "exercise_name": EXERCISES.get(self.exercise_key, {}).get("name", ""),
            "total_reps":    total,
            "good_reps":     good,
            "bad_reps":      self.state.form_errors,
            "form_score":    score,
            "rep_details":   self.session_reps,
            "grade": (
                "Excellent 🏆"      if score >= 90 else
                "Good 👍"           if score >= 70 else
                "Needs Work 💪"     if score >= 50 else
                "Keep Practicing 🔄"
            ),
        }
