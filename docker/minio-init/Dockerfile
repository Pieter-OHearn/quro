FROM minio/mc:RELEASE.2025-08-13T08-35-41Z

COPY docker/minio-init/init.sh /usr/local/bin/init-minio.sh

RUN chmod +x /usr/local/bin/init-minio.sh

ENTRYPOINT ["/bin/sh", "/usr/local/bin/init-minio.sh"]
