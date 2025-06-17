from llm_engine.base_engine import LLMEngine
from agent_session import AgentSession
from container import Container
from broker import broker

from litellm import model_cost
from litellm.utils import trim_messages
from glob import glob
from aioshutil import sync_to_async

import asyncio
import uuid
import mimetypes
import hashlib
import os
import re
import aiofiles
import aiofiles.os
import aioshutil


SYSTEM_PROMPT = """You are an expert Python programming assistant that helps scientist users to write high-quality code to solve their tasks.
Given a user request, you are expected to write a complete program that accomplishes the requested task and save any outputs in the correct format.
Please wrap your program in a code block that specifies the script type, python. For example:
```python
print("Hello World!")
```"""

SELF_DEBUG_PROMPT = """The user may execute your code and report any exceptions and error messages.
Please address the reported issues and respond with a fixed, complete program."""

FORMAT_PROMPT = """Please keep your response concise and do not use a code block if it's not intended to be executed.
Please do not suggest a few line changes, incomplete program outline, or partial code that requires the user to modify.
Please do not use any interactive Python commands in your program, such as `!pip install numpy`, which will cause execution errors.
Assume that all required packages are already installed and do not tell the user to install any packages.
Your program should save any output files to the `./pred_results` directory which already exists.
"""

REQUEST_PROMPT = "Here's the user request you need to work on:"

DATA_INFO_PROMPT = """You can access the files at `/uploads`, which has the following directory structure:
```
{uploads_folder_tree}
```
Here are some helpful previews for the dataset file(s):
```
{dataset_preview}
```
"""


ARCHIVE_FILE_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz']


class ScienceAgent():
    def __init__(self, agent_session_id: str, llm_engine_name, context_cutoff=28000):
        self.llm_engine = LLMEngine(llm_engine_name, api_key=os.getenv('LLM_API_KEY'))
        if model_cost.get(llm_engine_name) is None:
            print(f"Warning: no model cost information found for {llm_engine_name}")

        self.llm_cost = model_cost.get(llm_engine_name, {
            "input_cost_per_token": 0,
            "output_cost_per_token": 0,
        })
        self.context_cutoff = context_cutoff
        self.agent_session_id = agent_session_id

    def get_sys_msg(self, uploads_folder_tree, dataset_preview, task_inst, domain_knowledge, use_self_debug, use_knowledge=True):
        sys_msg = (
            SYSTEM_PROMPT + "\n\n" +
            (SELF_DEBUG_PROMPT + "\n\n" if use_self_debug else "") +
            FORMAT_PROMPT + "\n\n" + REQUEST_PROMPT
        )

        sys_msg += (
            "\n" + task_inst +
            ("\n" + str(domain_knowledge) if (use_knowledge and domain_knowledge) else "")
        )


        if uploads_folder_tree.strip() != "":
            sys_msg += (
                "\n" +
                DATA_INFO_PROMPT.format(
                    uploads_folder_tree = uploads_folder_tree,
                    dataset_preview = dataset_preview,
                )
            )

        trimmed_sys_msg = trim_messages(
            [{'role': 'user', 'content': sys_msg}],
            self.llm_engine.llm_engine_name,
            max_tokens=self.context_cutoff - 2000
        )[0]["content"]

        if len(trimmed_sys_msg) < len(sys_msg):
            sys_msg = trimmed_sys_msg + "..."

        return sys_msg


    def extract_program(self, assistant_output) -> list[str]:
        matches = re.findall(r"```python(.*?)```", assistant_output, re.DOTALL)
        if not matches:
            return []
        return [match.strip() for match in matches]


    async def sync_uploads_dir(self, container: Container):
        await AgentSession.download_missing_uploaded_files(self.agent_session_id, container.get_uploads_dir())

        # extract contents of archive files
        for file in await sync_to_async(glob)(container.get_uploads_dir() + '/**/*', recursive=True):
            if os.path.splitext(file)[1] in ARCHIVE_FILE_EXTENSIONS:
                extract_dir = os.path.join(container.get_uploads_dir(), file+".extracted")
                if not await aiofiles.os.path.exists(extract_dir):
                    await aiofiles.os.mkdir(extract_dir)
                    await aioshutil.unpack_archive(file, extract_dir)


    async def install(self, code_data, container: Container):
        print("Installing dependencies for code file:", code_data['filename'])

        err_msg = ""
        _, exit_code = await container.run_command(
            ["pipreqs", ".", "--savepath=requirements.in", "--mode", "no-pin"],
            message_tag="install")
        if exit_code != 0:
            err_msg = "There is a problem extracting packages used in the program. Please use packages that are easier to identify and install via pip."

            return True, err_msg

        _, exit_code = await container.run_command(
            ["pip-compile", "--upgrade-package", "numpy<2.0", "--resolver", "legacy", "--no-strip-extras", "--output-file", "eval_requirements.txt"],
            message_tag="install")
        if exit_code != 0:
            print('Legacy resolver failed. Trying backtracking resolver...')
            _, exit_code = await container.run_command(
                ["pip-compile", "--upgrade-package", "numpy<2.0", "--no-strip-extras", "--output-file", "eval_requirements.txt"],
                message_tag="install")
            if exit_code != 0:
                err_msg = "There is a problem resolving the requirements of packages used in the program. Please use packages that do not have conflicts."

                return True, err_msg

        #output, exit_code = await container.run_command(["pip-sync", "eval_requirements.txt"], message_tag="install")
        output, exit_code = await container.run_command(["pip", "install", "-r", "eval_requirements.txt"], message_tag="install")
        if exit_code != 0:
            err_msg = output

            trimmed_err_msg = trim_messages(
                [{'role': 'user', 'content': err_msg}],
                self.llm_engine.llm_engine_name,
                max_tokens=5000
            )[0]["content"]

            if len(trimmed_err_msg) < len(err_msg):
                err_msg = trimmed_err_msg + "..."

            return True, err_msg

        return False, err_msg


    async def run_program(self, code_data, container: Container, timeout=900):
        # clean out old files in the eval directory
        eval_dir = container.get_eval_dir()
        for file in await aiofiles.os.listdir(eval_dir):
            file_path = os.path.join(eval_dir, file)
            try:
                if await aiofiles.os.path.isfile(file_path):
                    await aiofiles.os.unlink(file_path)
                elif os.path.isdir(file_path):
                    await aioshutil.rmtree(file_path)
            except Exception as e:
                print(e)

        # create the outputs directory
        await aiofiles.os.makedirs(os.path.join(eval_dir, "pred_results"), exist_ok=True)

        # sync user uploaded files with the container's mounted uploads directory
        await self.sync_uploads_dir(container)

        # write the program to eval directory so it can be executed in the container
        async with aiofiles.open(os.path.join(eval_dir, code_data['filename']), "w") as f:
            content = code_data['user_content']
            # do some monkey patching to make gold programs executable
            if code_data.get('is_gold'):
                content = re.sub(r'(\.\/)?benchmark\/datasets\/([^\/]*\/?)?', '/uploads/', content)
            await f.write(content)

        module_name = code_data['filename'].replace("/", '.')[:-3] # remove ".py" suffix
        run_output, exit_code = await container.run_command(
            ["python", "-m", module_name], timeout=timeout, message_tag="run")

        output_dir = os.path.join(container.get_eval_dir(), 'pred_results')
        outputs = await self.list_outputs(output_dir, code_data['id'])
        all_output_files = await AgentSession.add_output_files(self.agent_session_id, outputs, output_dir)
        await broker.publish(self.agent_session_id, {'type': 'output_files', 'files': all_output_files})

        return run_output, exit_code


    async def run_program_maybe_install(self, code_data, container: Container, timeout=900):
        # try to run the program
        try:
            output, exit_code = await self.run_program(code_data, container, timeout=timeout)
        except TimeoutError:
            return "Timeout", 1

        # if the program fails due to missing modules, try to install them
        if "Traceback" in output and "ModuleNotFoundError: No module" in output:
            install_err, err_msg = await self.install(code_data, container)
            if install_err:
                return err_msg, 1
            try:
                output, exit_code = await self.run_program(code_data, container, timeout=timeout)
            except TimeoutError:
                return "Timeout", 1

        return output, exit_code


    async def execute(self, code_id: str, container: Container, timeout=1400):
        code_data = None
        for code_file in await AgentSession.get_code_files(self.agent_session_id):
            if code_file['id'] == code_id:
                code_data = code_file
                break
        if code_data is None:
            return "Code file not found", 1

        output, exit_code = await self.run_program_maybe_install(code_data, container, timeout=timeout)
        return output, exit_code


    async def list_outputs(self, output_dir, code_data_id: str):
        files = await sync_to_async(glob)(output_dir + '/**/*', recursive=True)
        results = []
        for fname in files:
            hasher = hashlib.new('sha256')
            async with aiofiles.open(fname, 'rb') as f:
                while True:
                    buf = await f.read(8192)
                    if not buf:
                        break
                    hasher.update(buf)
            hash = hasher.hexdigest()[0:32]
            mimetypes.guess_type(fname)[0]
            relname = os.path.relpath(fname, output_dir)
            size = await aiofiles.os.path.getsize(fname)
            object_name = f"{self.agent_session_id}/outputs/{hash}{os.path.splitext(fname)[1]}"
            results.append({
                'id': str(uuid.uuid4()),
                'code_data_id': code_data_id,
                'hash': hash,
                'filename': relname,
                'size': size,
                'mimetype': mimetypes.guess_type(fname)[0],
                'object_name': object_name,
            })

        return results


    async def step(self, code_data, container: Container, history: list, timeout=900):
        special_err = False
        run_output, exit_code = await self.run_program_maybe_install(code_data, container, timeout=timeout)
        if run_output == "Timeout":
            special_err = True
            err_msg = f"The program fails to finish execution within {timeout} seconds. Please try to reduce the execution time of your implementation."

        if (not special_err) and exit_code == 0:
            output_dir = os.path.join(container.get_eval_dir(), 'pred_results')
            if len(await aiofiles.os.listdir(output_dir)) == 0:
                special_err = True
                err_msg = "The program does not save its output correctly. Please check if the functions are executed and the output path is correct."

        if (not special_err) and exit_code == 0:
            return True, None, None
        else:
            if not special_err:
                err_msg = run_output

                trimmed_err_msg = trim_messages(
                    [{'role': 'user', 'content': err_msg}],
                    self.llm_engine.llm_engine_name,
                    max_tokens=2000
                )[0]["content"]

                if len(trimmed_err_msg) < len(err_msg):
                    err_msg = trimmed_err_msg + "..."

            self_debug_history = [history[0], history[-1]]
            _, new_code_data, new_history = await self.generate(err_msg, self_debug_history)
            if new_code_data and new_code_data['content'].strip() == code_data['content'].strip():
                # send early stopping signal if program is unchanged after debugging
                return True, new_code_data, None

            return False, new_code_data, new_history


    async def generate(self, user_message, history, prompt_tag=None):
        user_input = [
            *history,
            {'role': 'user', 'content': user_message},
        ]

        prompt_history_id = str(uuid.uuid4())
        response_history_id = str(uuid.uuid4())

        await broker.publish(self.agent_session_id, {'type': 'response_start', 'role': 'user', 'tag': prompt_tag, 'id': prompt_history_id})
        await broker.publish(self.agent_session_id, {'type': 'response_chunk', 'text': user_message, 'id': prompt_history_id})
        await broker.publish(self.agent_session_id, {'type': 'response_end', 'id': prompt_history_id})
        await broker.publish(self.agent_session_id, {'type': 'response_start', 'role': 'assistant', 'id': response_history_id})

        assistant_output = ''
        total_prompt_tokens = 0
        total_completion_tokens = 0
        async for chunk, prompt_tokens, completion_tokens in self.llm_engine.respond_stream(user_input, temperature=0.2, top_p=0.95):
            total_prompt_tokens += prompt_tokens
            total_completion_tokens += completion_tokens
            if chunk:
                assistant_output += chunk
                await broker.publish(self.agent_session_id, {'type': 'response_chunk', 'text': chunk, 'id': response_history_id})

        cost = total_prompt_tokens * self.llm_cost["input_cost_per_token"] + \
               total_completion_tokens * self.llm_cost["output_cost_per_token"]

        await broker.publish(self.agent_session_id, {'type': 'response_end', 'id': response_history_id})
        await broker.publish(self.agent_session_id, {
            'type': 'usage',
            'cost': cost,
            'prompt_tokens': total_prompt_tokens,
            'completion_tokens': total_completion_tokens,
        })

        new_history = [
            {'role': 'user', 'content': user_message, 'tag': prompt_tag, 'id': prompt_history_id},
            {'role': 'assistant', 'content': assistant_output, 'llm_engine_name': self.llm_engine.llm_engine_name, 'id': response_history_id},
        ]

        tasks = [
            AgentSession.add_history(self.agent_session_id, new_history),
            AgentSession.add_usage(self.agent_session_id, total_completion_tokens, total_prompt_tokens, cost),
        ]

        code_output = self.extract_program(assistant_output)
        code_data = None
        if len(code_output) > 0:
            code_files = await AgentSession.get_code_files(self.agent_session_id)
            for i, code_str in enumerate(code_output):
                filename = f'program-{len(code_files)+i}.py'
                code_data = {
                    'id': str(uuid.uuid4()),
                    'filename': filename,
                    'content': code_str, # original generated code
                    'user_content': code_str, # user modified code
                    'history_id': response_history_id,
                    'block_index': i,
                    'is_gold': False,
                }
                tasks.append(AgentSession.add_code_file(self.agent_session_id, code_data))
                await broker.publish(self.agent_session_id, {'type': 'code_file', 'code_file': code_data})

        await asyncio.gather(*tasks)

        return assistant_output, code_data, new_history

    async def ask_follow_up(self, message: str, code_id: str):
        code_data = None
        for code_file in await AgentSession.get_code_files(self.agent_session_id):
            if code_file['id'] == code_id:
                code_data = code_file
                break
        if code_data is None:
            print("Error: code file not found with id", code_id)

        history = await AgentSession.get_history(self.agent_session_id)

        if code_data is not None and code_data['user_content'] != code_data['content']:
            message = 'BEGIN_CONTEXT: \nHere is the latest program the user is working on:\n ```python' + code_data['user_content'] + '```\nEND_CONTEXT\n\n' + message

        await self.generate(message, history)

    async def solve_task(self, container: Container, use_self_debug=True):
        await self.sync_uploads_dir(container)
        uploads_folder_tree = await generate_folder_tree(container.get_uploads_dir())
        dataset_preview = await generate_data_preview(container.get_uploads_dir())

        # clear any previous history and outputs
        await AgentSession.clear(self.agent_session_id)

        session = await AgentSession.get(self.agent_session_id)

        sys_msg = self.get_sys_msg(
            uploads_folder_tree,
            dataset_preview,
            session["task_instruction"],
            session["domain_knowledge"],
            use_self_debug,
            use_knowledge=True,
        )

        history = session['history']
        _, code_data, new_history = await self.generate(sys_msg, history, prompt_tag="system")
        history = [*history, *new_history]

        if use_self_debug:
            for t in range(3):
                print("Running self-debug iteration", t)
                halt, code_data, new_history = await self.step(code_data, container, history)
                if new_history:
                    history = [*history, *new_history]
                if halt:
                    break


async def generate_folder_tree(root_dir, indent=''):
    """Generates a string representation of the folder tree."""
    tree = ''
    items = await aiofiles.os.listdir(root_dir)
    num_items = len(items)

    for index, item in enumerate(items):
        item_path = os.path.join(root_dir, item)
        is_last = index == num_items - 1

        if index > 0:
            tree += '\n'
        tree += indent
        tree += '└── ' if is_last else '├── '
        tree += item

        if await aiofiles.os.path.isdir(item_path):
            new_indent = indent + ('    ' if is_last else '│   ')
            tree += await generate_folder_tree(item_path, new_indent)
    return tree


async def generate_file_preview(filename):
    _, ext = os.path.splitext(filename)
    if not ext or ext in (".csv", ".tsv", ".txt") or "json" in ext:
        try:
            async with aiofiles.open(filename) as f:
                preview = await f.read(500)
                final_char = await f.read(1)
            if not final_char:
                preview += '\n...'
            preview += '\n'
            return preview
        except:
            return None
    elif ext in (".py"):
        async with aiofiles.open(filename) as f:
            return await f.read()
    return None


async def generate_data_preview(dir, root_dir='/uploads'):
    items = await aiofiles.os.listdir(dir)
    preview = ''
    for item in items:
        item_path = os.path.join(dir, item)
        file_preview = await generate_file_preview(item_path)
        if file_preview:
            preview += f"[START Preview of {root_dir}/{item}]\n"
            preview += file_preview
            preview += f"[END Preview of {root_dir}/{item}]\n"
        if await aiofiles.os.path.isdir(item_path):
            # NOTE: subfolders can occur if the user uploads a zip file which is automatically extracted
            preview += await generate_data_preview(item_path, root_dir+'/'+item)

    return preview
