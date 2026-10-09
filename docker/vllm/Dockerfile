FROM vllm/vllm-openai:v0.31.0

COPY docker/vllm/run-vllm.sh /usr/local/bin/run-vllm.sh

RUN chmod +x /usr/local/bin/run-vllm.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/run-vllm.sh"]
