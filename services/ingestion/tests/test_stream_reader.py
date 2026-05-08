"""
Tests for StreamReader.

TODO: Implement the following test cases:

    test_reconnects_on_connection_error:
        Mock av.open to raise av.error.AVError on first call, succeed on second.
        Assert StreamReader.run() calls _open_stream() twice.

    test_fps_throttling:
        Feed 30 synthetic frames per second, assert only ~5 are published
        when fps_target=5 (within 10% tolerance over a 1-second window).

    test_graceful_shutdown:
        Cancel the run() coroutine via asyncio cancellation.
        Assert no SharedMemory blocks remain open (check /dev/shm or mock).

    test_frame_decode_returns_numpy_array:
        Mock av.Packet with a synthetic JPEG payload.
        Assert _decode_frame() returns an ndarray with shape (H, W, 3).

Use pytest-asyncio for async tests, pytest-mock for PyAV mocking.
"""
import pytest
