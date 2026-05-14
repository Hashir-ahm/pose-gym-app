FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libglib2.0-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install in strict order — numpy first, then torch, then cv2, then mediapipe
RUN pip install --no-cache-dir "numpy==1.26.4"

RUN pip install --no-cache-dir \
    torch==2.5.1+cpu \
    torchvision==0.20.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    "opencv-python-headless==4.9.0.80"

RUN pip install --no-cache-dir \
    "mediapipe==0.10.14"

RUN pip install --no-cache-dir \
    "fastapi==0.136.1" \
    "uvicorn[standard]==0.46.0" \
    "websockets==16.0" \
    "python-multipart==0.0.27" \
    "aiofiles==25.1.0" \
    "scipy==1.13.0"

COPY . .

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]