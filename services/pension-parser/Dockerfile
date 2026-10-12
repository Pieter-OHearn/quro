FROM python:3.12.14-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-nld && \
    rm -rf /var/lib/apt/lists/*

# The service runs as an unprivileged user that owns nothing in the image.
RUN groupadd --system --gid 10001 parser && \
    useradd --system --uid 10001 --gid parser --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin parser

WORKDIR /app

COPY services/pension-parser/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/pension-parser/app /app/app

USER 10001:10001

EXPOSE 8080

# `python -m app` starts uvicorn with the connection bound derived from the extraction queue.
CMD ["python", "-m", "app"]
