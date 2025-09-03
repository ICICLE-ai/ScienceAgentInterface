import config

if config.STORAGE_BACKEND == "s3":
    from .s3_backend import S3Storage as Storage
elif config.STORAGE_BACKEND == "filesystem":
    from .filesystem_backend import FilesystemStorage as Storage
else:
    raise ValueError(f"Unsupported STORAGE_BACKEND: {config.STORAGE_BACKEND}")