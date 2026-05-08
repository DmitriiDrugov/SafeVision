"""Unit tests for the CameraManager hot-reload reconciler."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from schemas.camera import Camera


def _cam(cam_id: str, rtsp_url: str = "rtsp://host/cam", enabled: bool = True) -> Camera:
    return Camera(id=cam_id, name=cam_id, rtsp_url=rtsp_url, zones=[], enabled=enabled)


@pytest.fixture()
def mock_publisher() -> AsyncMock:
    return AsyncMock()


def _make_manager(publisher: AsyncMock) -> object:
    from ingestion.main import CameraManager
    return CameraManager(publisher=publisher, fps_target=5.0)


class TestReconcileStart:
    @pytest.mark.asyncio()
    async def test_starts_enabled_cameras(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)
        cameras = [_cam("cam01"), _cam("cam02")]

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile(cameras)

        assert set(manager.running_camera_ids) == {"cam01", "cam02"}

    @pytest.mark.asyncio()
    async def test_skips_disabled_cameras(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)
        cameras = [_cam("cam01"), _cam("cam02", enabled=False)]

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile(cameras)

        assert manager.running_camera_ids == ["cam01"]


class TestReconcileStop:
    @pytest.mark.asyncio()
    async def test_stops_removed_camera(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile([_cam("cam01"), _cam("cam02")])
            assert set(manager.running_camera_ids) == {"cam01", "cam02"}

            # Remove cam02
            await manager.reconcile([_cam("cam01")])

        assert manager.running_camera_ids == ["cam01"]

    @pytest.mark.asyncio()
    async def test_stops_disabled_camera(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile([_cam("cam01")])
            await manager.reconcile([_cam("cam01", enabled=False)])

        assert manager.running_camera_ids == []


class TestReconcileRestart:
    @pytest.mark.asyncio()
    async def test_restarts_on_rtsp_url_change(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile([_cam("cam01", rtsp_url="rtsp://old/cam")])
            await manager.reconcile([_cam("cam01", rtsp_url="rtsp://new/cam")])

        # Should have been constructed twice (once for old URL, once for new)
        assert MockReader.call_count == 2
        # Camera should still be running after restart
        assert manager.running_camera_ids == ["cam01"]

    @pytest.mark.asyncio()
    async def test_no_restart_when_url_unchanged(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile([_cam("cam01")])
            await manager.reconcile([_cam("cam01")])

        # Only one StreamReader should be created
        assert MockReader.call_count == 1

    @pytest.mark.asyncio()
    async def test_restarts_dead_task(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        async def _run_and_die() -> None:
            pass  # returns immediately — task will be done()

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = _run_and_die
            await manager.reconcile([_cam("cam01")])

            # Wait for the task to complete
            await asyncio.sleep(0.05)

            # Reconcile again — should detect the dead task and restart
            instance2 = AsyncMock()
            instance2.run = AsyncMock()
            MockReader.return_value = instance2
            await manager.reconcile([_cam("cam01")])

        assert manager.running_camera_ids == ["cam01"]


class TestStopAll:
    @pytest.mark.asyncio()
    async def test_stop_all_clears_running(self, mock_publisher: AsyncMock) -> None:
        manager = _make_manager(mock_publisher)

        with patch("ingestion.main.StreamReader") as MockReader:
            instance = MockReader.return_value
            instance.run = AsyncMock()
            await manager.reconcile([_cam("cam01"), _cam("cam02")])
            await manager.stop_all()

        assert manager.running_camera_ids == []
