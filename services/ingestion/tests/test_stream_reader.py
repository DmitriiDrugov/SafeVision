"""Unit tests for StreamReader."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from schemas.camera import Camera


@pytest.fixture()
def camera() -> Camera:
    return Camera(
        id="cam01",
        name="Test Camera",
        rtsp_url="rtsp://localhost:8554/test",
        zones=[],
        enabled=True,
    )


@pytest.fixture()
def mock_publisher() -> AsyncMock:
    pub = AsyncMock()
    pub.publish = AsyncMock(return_value="sv_cam01_0")
    return pub


def _make_reader(camera: Camera, publisher: AsyncMock) -> object:
    from ingestion.stream_reader import StreamReader

    return StreamReader(camera=camera, publisher=publisher, fps_target=5.0)


class TestShouldSample:
    def test_samples_when_interval_elapsed(self, camera: Camera, mock_publisher: AsyncMock) -> None:
        reader = _make_reader(camera, mock_publisher)
        assert reader._should_sample(now=2.0, last_sample_time=1.79) is True

    def test_skips_when_interval_not_elapsed(
        self, camera: Camera, mock_publisher: AsyncMock
    ) -> None:
        reader = _make_reader(camera, mock_publisher)
        # 5 fps = 0.2 s interval; 0.05 s has elapsed — should skip
        assert reader._should_sample(now=1.9, last_sample_time=1.85) is False

    def test_first_frame_always_sampled(self, camera: Camera, mock_publisher: AsyncMock) -> None:
        reader = _make_reader(camera, mock_publisher)
        assert reader._should_sample(now=0.21, last_sample_time=0.0) is True


class TestGracefulStop:
    @pytest.mark.asyncio()
    async def test_stop_terminates_run(self, camera: Camera, mock_publisher: AsyncMock) -> None:
        reader = _make_reader(camera, mock_publisher)

        async def _fake_loop() -> None:
            while reader._running:
                await asyncio.sleep(0.01)

        with patch.object(reader, "_stream_loop", side_effect=_fake_loop):
            run_task = asyncio.create_task(reader.run())
            await asyncio.sleep(0.05)
            reader.stop()
            await asyncio.wait_for(run_task, timeout=1.0)

        assert reader._running is False


class TestReconnect:
    @pytest.mark.asyncio()
    async def test_reconnects_after_error(self, camera: Camera, mock_publisher: AsyncMock) -> None:
        reader = _make_reader(camera, mock_publisher)
        call_count = 0

        async def _failing_loop() -> None:
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise OSError("connection refused")
            reader.stop()

        with (
            patch.object(reader, "_stream_loop", side_effect=_failing_loop),
            patch("ingestion.stream_reader.asyncio.sleep", new_callable=AsyncMock),
        ):
            await reader.run()

        assert call_count == 3

    @pytest.mark.asyncio()
    async def test_backoff_doubles(self, camera: Camera, mock_publisher: AsyncMock) -> None:
        reader = _make_reader(camera, mock_publisher)
        slept: list[float] = []

        async def _fake_sleep(delay: float) -> None:
            slept.append(delay)
            if len(slept) >= 2:
                reader.stop()

        async def _fail_always() -> None:
            raise OSError("fail")

        with (
            patch.object(reader, "_stream_loop", side_effect=_fail_always),
            patch("ingestion.stream_reader.asyncio.sleep", side_effect=_fake_sleep),
        ):
            await reader.run()

        assert slept[0] == 1.0
        assert slept[1] == 2.0
