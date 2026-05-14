import numpy as np
import mediapipe as mp
import torch
import cv2

mp_pose = mp.solutions.pose
MP      = mp_pose.PoseLandmark
RNG     = np.random.default_rng(42)

JOINT_NAMES = [
    "Pelvis", "R.Hip", "R.Knee", "R.Ankle",
    "L.Hip", "L.Knee", "L.Ankle", "Spine",
    "Thorax", "Neck", "Head",
    "L.Shoulder", "L.Elbow", "L.Wrist",
    "R.Shoulder", "R.Elbow", "R.Wrist",
]

BONES = [
    (0,1),(1,2),(2,3),
    (0,4),(4,5),(5,6),
    (0,7),(7,8),(8,9),(9,10),
    (8,11),(11,12),(12,13),
    (8,14),(14,15),(15,16),
]


def mediapipe_to_17joints(landmarks, W: int, H: int):
    lm = landmarks.landmark

    def pt(idx):
        return np.array([lm[idx].x * W, lm[idx].y * H], dtype=np.float32)

    def mid(a, b):
        return (pt(a) + pt(b)) / 2.0

    try:
        return np.array([
            mid(MP.LEFT_HIP,      MP.RIGHT_HIP),
            pt(MP.RIGHT_HIP),
            pt(MP.RIGHT_KNEE),
            pt(MP.RIGHT_ANKLE),
            pt(MP.LEFT_HIP),
            pt(MP.LEFT_KNEE),
            pt(MP.LEFT_ANKLE),
            mid(MP.LEFT_HIP,      MP.LEFT_SHOULDER),
            mid(MP.LEFT_SHOULDER, MP.RIGHT_SHOULDER),
            mid(MP.LEFT_EAR,      MP.RIGHT_EAR),
            mid(MP.LEFT_EAR,      MP.RIGHT_EAR),
            pt(MP.LEFT_SHOULDER),
            pt(MP.LEFT_ELBOW),
            pt(MP.LEFT_WRIST),
            pt(MP.RIGHT_SHOULDER),
            pt(MP.RIGHT_ELBOW),
            pt(MP.RIGHT_WRIST),
        ], dtype=np.float32)
    except Exception:
        return None


def is_person_centered(landmarks, W: int, H: int, tolerance: float = 0.38) -> bool:
    """
    Returns True only if the detected person's torso center
    is within the central region of the frame.
    Rejects people standing at the edges (background people).
    """
    lm = landmarks.landmark
    try:
        # Use shoulder midpoint as proxy for body center x
        l_shoulder_x = lm[MP.LEFT_SHOULDER].x
        r_shoulder_x = lm[MP.RIGHT_SHOULDER].x
        center_x     = (l_shoulder_x + r_shoulder_x) / 2.0  # normalised 0-1

        # Must be within central band (0.5 ± tolerance)
        return abs(center_x - 0.5) < tolerance
    except Exception:
        return True  # if check fails, allow it


def build_model_input(joints_2d: np.ndarray) -> torch.Tensor:
    root     = joints_2d[0]
    centered = joints_2d - root
    views    = [centered.reshape(-1)]
    for _ in range(3):
        noise = RNG.normal(0, 2.0, centered.shape).astype(np.float32)
        views.append((centered + noise).reshape(-1))
    x = np.concatenate(views).astype(np.float32)
    return torch.tensor(x).unsqueeze(0)


class PoseInference:
    def __init__(self, model, device="cpu"):
        self.model  = model
        self.device = device
        self.pose   = mp_pose.Pose(
            min_detection_confidence=0.4,
            min_tracking_confidence=0.4,
            model_complexity=1,
        )

    def infer_from_frame(self, frame_bytes: bytes):
        """
        Takes raw JPEG bytes from frontend.
        Only processes the person closest to the center of the frame.
        Returns dict with joints_2d, joints_3d, detected bool.
        """
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"detected": False}

        H, W  = frame.shape[:2]
        rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.pose.process(rgb)

        if not result.pose_landmarks:
            return {"detected": False}

        # ── Center filter — reject if person is too far from center ──────────
        if not is_person_centered(result.pose_landmarks, W, H, tolerance=0.38):
            return {"detected": False}

        joints_2d = mediapipe_to_17joints(result.pose_landmarks, W, H)
        if joints_2d is None:
            return {"detected": False}

        with torch.no_grad():
            x_in      = build_model_input(joints_2d).to(self.device)
            pred      = self.model(x_in)
            joints_3d = pred.cpu().numpy().reshape(17, 3)

        scale     = max(np.ptp(joints_3d, axis=0).max(), 1e-6)
        joints_3d = joints_3d / scale

        return {
            "detected":    True,
            "joints_2d":   joints_2d.tolist(),
            "joints_3d":   joints_3d.tolist(),
            "joint_names": JOINT_NAMES,
            "bones":       BONES,
        }

    def infer_from_video(self, video_path: str):
        cap        = cv2.VideoCapture(video_path)
        frames_out = []
        fps        = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_idx  = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % 3 == 0:
                _, buf = cv2.imencode('.jpg', frame)
                result = self.infer_from_frame(buf.tobytes())
                result["frame_idx"] = frame_idx
                frames_out.append(result)
            frame_idx += 1

        cap.release()
        return {"fps": fps / 3, "total_frames": len(frames_out), "frames": frames_out}
