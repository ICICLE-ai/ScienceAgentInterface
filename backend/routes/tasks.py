from quart import Blueprint, request
from agent_session import AgentSession

tasks_blueprint      = Blueprint('tasks', __name__)
user_tasks_blueprint = Blueprint('userTasks', __name__)


@tasks_blueprint.route("/", methods=["GET", "POST", "OPTIONS"])
async def tasks():
    tasks = await AgentSession.get_benchmark_tasks()

    # Patch each task to ensure it has metadata
    for task in tasks:
        if "metadata" not in task:
            task["metadata"] = {
                "source": "benchmark",
                "domain": task.get("domain", "Unknown"),
            }

    return tasks


@user_tasks_blueprint.route("/user_tasks", methods=["GET","POST","OPTIONS"])
async def user_tasks():
    if request.method == "POST" :
        pass

    user_id = request.args.get('user_id')
    user_data = await AgentSession.get_user_tasks(user_id)
    return user_data


@tasks_blueprint.route("/<string:id>", methods=["GET"])
async def get_task(id):
    try:
        data = await AgentSession(id).get()
    except:
        return {"error": "Failed to load dataset"}, 404
    return data


@tasks_blueprint.route("/<string:id>/agent_session", methods=["POST"])
async def create_session_from_task(id):
    prefill = await AgentSession(id).get()
    prefill['metadata']['source'] = 'user'
    agent_session_id = await AgentSession.create(prefill)
    return { "agent_session_id": agent_session_id }