FROM ghcr.io/docling-project/docling-serve-cpu:v1.23.0

USER root

RUN python3 -m pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    "docling==2.102.1"

USER 1001
