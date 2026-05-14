FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Step 1: Install numpy first at correct version
RUN pip install --no-cache-dir numpy==2.0.0

# Step 2: Install CPU torch
RUN pip install --no-cache-dir \
    torch==2.5.1+cpu \
    torchvision==0.20.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Step 3: Install everything else
RUN pip install --no-cache-dir \
    fastapi==0.111.0 \
    "uvicorn[standard]==0.29.0" \
    websockets==12.0 \
    python-multipart==0.0.9 \
    aiofiles==23.2.1 \
    opencv-python-headless==4.10.0.84 \
    mediapipe==0.10.18 \
    scipy==1.13.0

COPY . .

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]