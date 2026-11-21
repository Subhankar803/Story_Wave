# Python 3.12 is the version MOSS-SoundEffect targets. The PyTorch cu128 wheels bundle their own CUDA
# libraries, so a plain Python image works; the host only needs an NVIDIA driver + nvidia-container-toolkit
# and must run the container with --gpus all.
FROM python:3.12-slim-bookworm

ARG MOSS_REF=main   # PIN THIS to a commit hash for reproducible builds

RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/OpenMOSS/MOSS-TTS.git \
    && cd MOSS-TTS && git checkout "${MOSS_REF}"

# 1) MOSS with its pinned torch/cu128 stack   2) our service deps   3) protobuf fix (see README)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cu128 \
        -e "/opt/MOSS-TTS/moss_soundeffect_v2[torch-cu128]"
COPY requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt \
    && pip install --no-cache-dir -U "protobuf>=5.29,<7"

WORKDIR /srv
COPY app /srv/app

ENV HF_HOME=/models \
    DATA_DIR=/data \
    HF_HUB_DISABLE_XET=1 \
    TORCHDYNAMO_DISABLE=1 \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
    USE_TF=0 USE_JAX=0 USE_FLAX=0 USE_TORCH=1 \
    PYTHONUNBUFFERED=1

VOLUME ["/models", "/data"]
EXPOSE 8000

# ONE worker only: each process would load its own 11 GB model onto the GPU.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
