FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install numpy first at exact version
RUN pip install --no-cache-dir numpy==2.4.2

# Install CPU torch matching your local versions
RUN pip install --no-cache-dir \
    torch==2.5.1+cpu \
    torchvision==0.20.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining packages at exact local versions
RUN pip install --no-cache-dir \
    mediapipe==0.10.21 \
    opencv-python-headless==4.10.0.84 \
    fastapi==0.136.1 \
    "uvicorn[standard]==0.46.0" \
    websockets==16.0 \
    python-multipart==0.0.27 \
    aiofiles==25.1.0 \
    scipy==1.17.0

COPY . .

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]