FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies (fonts for PDF generation, build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto-cjk \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Patch pdf2zh timeout
RUN python - <<'PY'
from pathlib import Path
p = Path("/usr/local/lib/python3.11/site-packages/pdf2zh/doclayout.py")
s = p.read_text()
old = "etag_timeout=1"
new = "etag_timeout=30"
if old not in s:
    raise SystemExit(f"patch target not found in {p}")
p.write_text(s.replace(old, new))
print("patched", p)
PY

COPY . .

# Create directories
RUN mkdir -p /app/tmp /app/data /app/logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]