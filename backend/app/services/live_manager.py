"""WebSocket connection manager for live bible/flag pushes."""
import json
from collections import defaultdict
from fastapi import WebSocket
from app.core.logging import logger


class LiveConnectionManager:
    """Manages WebSocket connections per story to broadcast live updates to clients."""

    def __init__(self):
        self.active_connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, story_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[story_id].add(websocket)
        logger.info(f"WebSocket client connected to story {story_id}. Total: {len(self.active_connections[story_id])}")

    def disconnect(self, story_id: int, websocket: WebSocket) -> None:
        if story_id in self.active_connections:
            self.active_connections[story_id].discard(websocket)
            if not self.active_connections[story_id]:
                del self.active_connections[story_id]
        logger.info(f"WebSocket client disconnected from story {story_id}")

    async def broadcast_to_story(self, story_id: int, message: dict) -> None:
        """Broadcast payload to all active clients connected to the story."""
        if story_id not in self.active_connections:
            return

        dead_connections: list[WebSocket] = []
        payload = json.dumps(message)

        for connection in list(self.active_connections[story_id]):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending message to client on story {story_id}: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(story_id, dead)

    async def notify_chapter_status(self, story_id: int, chapter_id: int, chapter_number: int, status: str, error: str | None = None):
        await self.broadcast_to_story(
            story_id,
            {
                "event": "chapter_status",
                "chapter_id": chapter_id,
                "chapter_number": chapter_number,
                "status": status,
                "error": error,
            },
        )

    async def notify_flag_detected(self, story_id: int, flag_data: dict):
        await self.broadcast_to_story(
            story_id,
            {
                "event": "flag_detected",
                "flag": flag_data,
            },
        )

    async def notify_bible_updated(self, story_id: int, fact_count: int, entity_count: int):
        await self.broadcast_to_story(
            story_id,
            {
                "event": "bible_updated",
                "fact_count": fact_count,
                "entity_count": entity_count,
            },
        )


live_manager = LiveConnectionManager()
