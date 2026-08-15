FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
WORKDIR /srv/app

ENV WARMIND_DB=/data/warmind.db
# ANTHROPIC_API_KEY is set at deploy time (Render env var). Without it the app
# runs in vision mock mode and screenshot reads return sample data.
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
