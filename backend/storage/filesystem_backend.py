import os
import aiofiles.os
import config
import aiofiles
import aioshutil

class FilesystemStorage:
    @staticmethod
    async def upload_file_stream(file, object_name: str):
        save_path = os.path.join(config.STORAGE_DIR, object_name)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        async with aiofiles.open(save_path, 'wb') as f:
            while True:
                chunk = file.stream.read(1024 * 1024)
                if not chunk:
                    break
                await f.write(chunk)
        return save_path

    @staticmethod
    async def upload_file(local_path: str, object_name: str):
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        async with aiofiles.open(local_path, 'rb') as f:
            content = await f.read()

        save_path = os.path.join(config.STORAGE_DIR, object_name)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        async with aiofiles.open(save_path, 'wb') as f:
            await f.write(content)

    @staticmethod
    async def download_file(object_name: str, local_path: str):
        await aioshutil.copyfile(
            os.path.join(config.STORAGE_DIR, object_name),
            local_path
        )

    @staticmethod
    async def remove_file(object_name: str):
        file_path = os.path.join(config.STORAGE_DIR, object_name)
        await aiofiles.os.remove(file_path)