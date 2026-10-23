FROM python:3.12.9-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY pipeline /app/pipeline
RUN uv sync --project pipeline --frozen --no-dev --extra extraction
ENV PATH="/app/pipeline/.venv/bin:$PATH"
ENTRYPOINT ["pipeline"]
