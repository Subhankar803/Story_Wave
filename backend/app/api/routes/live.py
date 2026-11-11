"""WS /stories/{id}/live."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.logging import logger
from app.services.live_manager import live_manager

router = APIRouter(tags=["Live WebSocket"])


@router.websocket("/stories/{id}/live")
async def websocket_live_updates(websocket: WebSocket, id: int):
    """WebSocket endpoint to push live story bible, chapter status, and flag updates to the frontend."""
    await live_manager.connect(id, websocket)
    try:
        while True:
            # Keep connection open and receive client heartbeat or commands
            data = await websocket.receive_text()
            # Echo heartbeat / ping if received
            if data == "ping":
                await websocket.send_text('{"event": "pong"}')
    except WebSocketDisconnect:
        live_manager.disconnect(id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error on story {id}: {e}")
        live_manager.disconnect(id, websocket)
