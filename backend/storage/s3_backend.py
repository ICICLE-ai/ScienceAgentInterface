import aioboto3
import config

boto3_session = aioboto3.Session(region_name=config.AWS_REGION)

class S3Storage:
    @staticmethod
    async def upload_file_stream(file, object_name: str):
        async with boto3_session.client('s3') as s3:
            await s3.upload_fileobj(file.stream, config.S3_BUCKET, object_name)

    @staticmethod
    async def upload_file(local_path: str, object_name: str):
        async with boto3_session.client('s3') as s3:
            await s3.upload_file(local_path, config.S3_BUCKET, object_name)

    @staticmethod
    async def download_file(object_name: str, local_path: str):
        async with boto3_session.client('s3') as s3:
            await s3.download_file(config.S3_BUCKET, object_name, local_path)

    @staticmethod
    async def remove_file(object_name: str):
        async with boto3_session.client('s3') as s3:
            await s3.delete_object(Bucket=config.S3_BUCKET, Key=object_name)