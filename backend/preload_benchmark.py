# This script uploads each task from the ScienceAgentBench dataset into the database as an AgentSession.
# Benchmark data must be located in the `./benchmark/` directory.

from datasets import load_dataset
from tqdm import tqdm
import glob
import uuid
import os
from agent_session import AgentSession
from storage import Storage

dataset = load_dataset("osunlp/ScienceAgentBench", split="validation")

async def upload_benchmark_tasks():
    for row in tqdm(dataset, desc="Uploading benchmark tasks"):
        gold_program_path = os.path.join("benchmark/gold_programs", row['gold_program_name'])
        with open(gold_program_path, 'r') as file:
            gold_program_content = file.read()
        dataset_dir = row['dataset_folder_tree'].split('\n')[0].lstrip('|--').strip().rstrip('/')

        assert len(dataset_dir) > 0
        assert os.path.exists(os.path.join("benchmark/datasets", dataset_dir)), f"Dataset directory {dataset_dir} does not exist"

        uploaded_files = []
        for fname in glob.glob(f"benchmark/datasets/{dataset_dir}/**/*", recursive=True):
            if os.path.isdir(fname):
                continue
            relname = os.path.relpath(fname, f"benchmark/datasets/{dataset_dir}")
            object_name = f"sab/datasets/{dataset_dir}/{relname}"
            await Storage.upload_file(fname, object_name)
            uploaded_files.append({
                "name": relname,
                "object_name": object_name,
                "size": os.path.getsize(fname),
                "source": "benchmark",
            })

        code_file = {
            'id': str(uuid.uuid4()),
            'filename': row['gold_program_name'],
            'content': gold_program_content,
            'user_content': gold_program_content,
            'history_id': '',
            'block_index': 0,
            'is_gold': True,
        }

        new_row = {
            "metadata": {
                **row,
                "source": "benchmark",
                "user_id": "",
            },
            "task_instruction": row['task_inst'],
            "domain_knowledge": row['domain_knowledge'],
            "code_files": [code_file],
            "uploaded_files": uploaded_files,
        }

        await AgentSession.create(new_row)

if __name__ == "__main__":
    import asyncio
    asyncio.run(upload_benchmark_tasks())
    print("Finished")