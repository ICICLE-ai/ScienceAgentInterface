# This script uploads the benchmark tasks to the DynamoDB table
# and the associated dataset files to the S3 bucket.

from datasets import load_dataset
from tqdm import tqdm
import glob
import time
import uuid
import os
import boto3
import config

dataset = load_dataset("osunlp/ScienceAgentBench", split="validation")

session = boto3.Session(region_name=config.AWS_REGION)
s3 = session.client('s3')
db = session.resource('dynamodb')

table = db.Table(config.AGENT_SESSION_TABLE_NAME)

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
        s3.upload_file(fname, config.S3_BUCKET, object_name)
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
        "id": str(uuid.uuid4()),
        "metadata": {
            **row,
            "created_at": int(time.time()),
            "source": "benchmark",
            "user_id": "",
        },
        "task_instruction": row['task_inst'],
        "domain_knowledge": row['domain_knowledge'],
        "code_files": [code_file],
        "uploaded_files": uploaded_files,
    }

    table.put_item(Item=new_row)