FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./app.py
EXPOSE 5002
CMD ["gunicorn", "--workers", "2", "--threads", "8", "--timeout", "20", "--bind", "0.0.0.0:5002", "app:app"]
