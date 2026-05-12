import os
import uuid
import asyncio
import tempfile
from pathlib import Path

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import aiofiles

from model import load_model
from inference import PoseInference
from gym_engine import GymEngine, EXERCISES

# ─── Config ──────────────────────────────────────────────────────────────────
MODEL_PATH  = os.getenv("MODEL_PATH", "best_combined_stage2.pth")
DEVICE      = "cuda" if torch.cuda.is_available() else "cpu"
UPLOAD_DIR  = Path(tempfile.gettempdir()) / "pose_uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

print(f"Loading model from : {MODEL_PATH}")
print(f"Device             : {DEVICE}")

try:
    _model   = load_model(MODEL_PATH, DEVICE)
    inferrer = PoseInference(_model, DEVICE)
    print("Model loaded successfully")
except FileNotFoundError:
    print(f"Model not found: {MODEL_PATH}")
    inferrer = None

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="PoseAI API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":       "ok",
        "model_loaded": inferrer is not None,
        "device":       DEVICE,
    }


# ─── Exercise List ────────────────────────────────────────────────────────────
@app.get("/api/exercises")
async def list_exercises():
    return {
        key: {
            "name":        ex["name"],
            "description": ex["description"],
        }
        for key, ex in EXERCISES.items()
    }


# ─── WebSocket — pose only ────────────────────────────────────────────────────
@app.websocket("/ws/pose")
async def websocket_pose(ws: WebSocket):
    await ws.accept()
    if inferrer is None:
        await ws.send_json({"error": "Model not loaded."})
        await ws.close()
        return
    try:
        while True:
            frame_bytes = await ws.receive_bytes()
            result = await asyncio.get_event_loop().run_in_executor(
                None, inferrer.infer_from_frame, frame_bytes
            )
            await ws.send_json(result)
    except WebSocketDisconnect:
        pass


# ─── WebSocket — gym mode ─────────────────────────────────────────────────────
@app.websocket("/ws/gym")
async def websocket_gym(ws: WebSocket, exercise: str = Query(...)):
    await ws.accept()

    if inferrer is None:
        await ws.send_json({"error": "Model not loaded."})
        await ws.close()
        return

    if exercise not in EXERCISES:
        await ws.send_json({"error": f"Unknown exercise: {exercise}"})
        await ws.close()
        return

    gym = GymEngine()
    gym.set_exercise(exercise)
    print(f"Gym session started: {exercise}")

    try:
        while True:
            data = await ws.receive()

            if "bytes" in data:
                frame_bytes = data["bytes"]
                pose_result = await asyncio.get_event_loop().run_in_executor(
                    None, inferrer.infer_from_frame, frame_bytes
                )

                if pose_result.get("detected"):
                    gym_result = gym.process_frame(pose_result["joints_3d"])
                    response   = {**pose_result, **gym_result, "mode": "gym"}
                else:
                    response   = {**pose_result, "mode": "gym",
                                  "rep_count": gym.state.rep_count,
                                  "form_status": "good", "active_error": ""}

                await ws.send_json(response)

            elif "text" in data:
                import json
                msg = json.loads(data["text"])
                if msg.get("action") == "get_summary":
                    await ws.send_json({"type": "summary", **gym.get_session_summary()})
                elif msg.get("action") == "reset":
                    gym.reset()
                    await ws.send_json({"type": "reset_ok"})

    except WebSocketDisconnect:
        print(f"Gym session ended: {gym.state.rep_count} reps")
    except Exception as e:
        print(f"Gym WS error: {e}")
        await ws.close()


# ─── REST — video upload ──────────────────────────────────────────────────────
@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    if inferrer is None:
        raise HTTPException(status_code=503, detail="Model not loaded.")

    allowed = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    ext     = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    tmp_path = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    async with aiofiles.open(tmp_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, inferrer.infer_from_video, str(tmp_path)
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
