import asyncio

# A simple in-memory broker
class LocalBroker:
    def __init__(self):
        self.connections = {}

    async def publish(self, agent_session_id: str, message: dict):
        for queue in self.connections.get(agent_session_id, []):
            await queue.put(message)

    async def subscribe(self, agent_session_id: str):
        queue = asyncio.Queue()
        self.connections.setdefault(agent_session_id, []).append(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self.connections[agent_session_id].remove(queue)

# To support multiple websocket connections to the same session across multiple processes/servers,
# a pub/sub system like ElastiCache/Redis is needed
class RedisBroker:
    pass
        
broker = LocalBroker()
