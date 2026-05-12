# PoseAI — 3D Human Pose Estimation Web App

## Project Structure
```
pose-app/
├── backend/     FastAPI + PyTorch + MediaPipe
└── frontend/    Next.js 14 + Tailwind + Three.js
```

---

## Local Setup

### Backend

```bash
cd backend

# Copy your trained model here
cp path/to/best_combined_stage2.pth .

# Install dependencies (in your conda env)
C:\Users\hashi\anaconda3\envs\twoDthreeD_pose_env\python.exe -m pip install -r requirements.txt

# Run
C:\Users\hashi\anaconda3\envs\twoDthreeD_pose_env\python.exe -m uvicorn main:app --reload --port 8000
```

Test it: open http://localhost:8000/health

### Frontend

```bash
cd frontend

# Install
npm install

# Copy env file
cp .env.example .env.local

# Run
npm run dev
```

Open http://localhost:3000

---

## Deploy to Railway (Backend)

1. Push `backend/` folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Select your repo
4. Add environment variable:
   - `MODEL_PATH` = `best_combined_stage2.pth`
5. Upload your `.pth` file via Railway's volume or use their file storage
6. Railway gives you a public URL like `https://your-app.railway.app`

## Deploy to Vercel (Frontend)

1. Push `frontend/` folder to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Add environment variables:
   - `NEXT_PUBLIC_BACKEND_URL` = `https://your-app.railway.app`
   - `NEXT_PUBLIC_WS_URL`      = `wss://your-app.railway.app`
4. Deploy — Vercel gives you `https://your-app.vercel.app`

---

## Features
- Login / Register (localStorage session, swap for NextAuth for production)
- Live webcam → WebSocket → FastAPI → MediaPipe → Model → 3D joints → Three.js
- Video upload → frame-by-frame inference → animated playback
- Interactive 3D skeleton (drag to rotate, scroll to zoom)
- Color-coded bones by body segment
