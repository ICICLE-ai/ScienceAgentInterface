import logging
import asyncio
import signal
import traceback
from quart import Quart, request, jsonify
from routes.tasks import tasks_blueprint, user_tasks_blueprint
from routes.evaluation import evaluation_blueprint
from routes.execution import execution_blueprint


logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')


app = Quart(__name__, static_folder=None)
app.register_blueprint(tasks_blueprint, url_prefix='/api/tasks')
app.register_blueprint(user_tasks_blueprint, url_prefix='/api/userTasks')
app.register_blueprint(evaluation_blueprint, url_prefix='/api/evaluate')
app.register_blueprint(execution_blueprint, url_prefix='/api/execution')


@app.after_request
async def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


@app.route("/api/<path:any>", methods=["OPTIONS"])
async def handle_options(any):
    response = app.response_class()
    response.status_code = 204
    return await add_cors_headers(response)


# Add signal handlers to avoid hanging async tasks
# Only applies to Python 3.11+, see related GitHub issue: https://github.com/pallets/quart/issues/333
@app.before_serving
async def startup():
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGINT, shutdown_handler)
    loop.add_signal_handler(signal.SIGTERM, shutdown_handler)


def shutdown_handler():
    for task in asyncio.all_tasks(asyncio.get_running_loop()):
        if not task.done():
            task.cancel()

@app.errorhandler(Exception)
async def handle_exception(error):
    traceback.print_exc()
    response = jsonify({"error": str(error)})
    response.status_code = 500
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
