FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py migrate.py ./
USER 10001
CMD ["gunicorn", "--workers", "2", "--threads", "8", "--timeout", "15", "app:app", "--bind", "0.0.0.0:5003"]
